import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Real-PostgreSQL behavior the unit suites can only assume:
 *   - the migration chain applies from an empty database (global-setup)
 *   - database-level constraints (partial unique index, composite uniques,
 *     enum columns, foreign keys) actually reject what the code relies on
 *     them rejecting
 *   - the conditional PENDING -> SENDING claim is atomic under competition
 *   - the P2002 unique race resolves to exactly one winner
 *   - representative claim-log and form invitation -> response workflows
 *     round-trip
 */

const url = process.env.INTEGRATION_DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'P2002';
}

let eventSeq = 0;
function makeEvent(overrides: Record<string, unknown> = {}) {
  eventSeq += 1;
  return {
    fellowshipId: 9000 + eventSeq,
    contactId: 100,
    academicYear: '2026-2027',
    emailType: 'BIO_PROJECT_DESCRIPTION' as const,
    status: 'PENDING' as const,
    sendAfter: new Date('2026-06-01T09:00:00Z'),
    triggeredBy: 'integration-test',
    ...overrides,
  };
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.formResponse.deleteMany();
  await prisma.formInvitation.deleteMany();
  await prisma.appointeeEmailEvent.deleteMany();
  await prisma.vitIdClaim.deleteMany();
});

describe('migration chain', () => {
  it('applied every migration in prisma/migrations with none rolled back', async () => {
    const migrationDirs = readdirSync(
      fileURLToPath(new URL('../../../prisma/migrations', import.meta.url)),
      { withFileTypes: true }
    ).filter((d) => d.isDirectory()).length;

    const rows = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;

    expect(Number(rows[0].count)).toBe(migrationDirs);
  });
});

describe('appointee email event constraints', () => {
  it('the partial unique index rejects a second in-flight row per (fellowship, type)', async () => {
    const first = makeEvent();
    await prisma.appointeeEmailEvent.create({ data: first });

    await expect(
      prisma.appointeeEmailEvent.create({
        data: makeEvent({ fellowshipId: first.fellowshipId }),
      })
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it('allows historical SENT/FAILED/SKIPPED rows to accumulate alongside one in-flight row', async () => {
    const fellowshipId = 9500;
    for (const status of ['SENT', 'FAILED', 'SKIPPED', 'SENT'] as const) {
      await prisma.appointeeEmailEvent.create({
        data: makeEvent({ fellowshipId, status }),
      });
    }
    await prisma.appointeeEmailEvent.create({
      data: makeEvent({ fellowshipId, status: 'PENDING' }),
    });

    const count = await prisma.appointeeEmailEvent.count({ where: { fellowshipId } });
    expect(count).toBe(5);
  });

  it('the database enum rejects an unknown status value outright', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO appointee_email_events
           (id, fellowship_id, contact_id, academic_year, email_type, status, send_after, triggered_by, updated_at)
         VALUES ('raw-test-id', 1, 1, '2026-2027', 'BIO_PROJECT_DESCRIPTION', 'EXPLODED', now(), 'test', now())`
      )
    ).rejects.toThrow(/invalid input value for enum|22P02|P2010/);
  });
});

describe('atomic PENDING -> SENDING dispatch claim', () => {
  it('the conditional flip wins once, then never again', async () => {
    const event = await prisma.appointeeEmailEvent.create({ data: makeEvent() });

    const first = await prisma.appointeeEmailEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    });
    const second = await prisma.appointeeEmailEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(0);
  });

  it('exactly ONE of N competing dispatchers claims the row', async () => {
    const event = await prisma.appointeeEmailEvent.create({ data: makeEvent() });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.appointeeEmailEvent.updateMany({
          where: { id: event.id, status: 'PENDING' },
          data: { status: 'SENDING' },
        })
      )
    );

    const winners = results.filter((r) => r.count === 1);
    expect(winners).toHaveLength(1);

    const row = await prisma.appointeeEmailEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe('SENDING');
  });

  it('a reclaim (SENDING -> PENDING) makes the row claimable exactly once more', async () => {
    const event = await prisma.appointeeEmailEvent.create({
      data: makeEvent({ status: 'SENDING' }),
    });

    await prisma.appointeeEmailEvent.updateMany({
      where: { id: event.id, status: 'SENDING', sesMessageId: null },
      data: { status: 'PENDING' },
    });
    const reclaimedFlip = await prisma.appointeeEmailEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    });

    expect(reclaimedFlip.count).toBe(1);
  });
});

describe('unique-race handling', () => {
  it('N concurrent creates of the same form invitation produce one row and N-1 P2002s', async () => {
    const data = {
      fellowshipId: 7001,
      contactId: 100,
      academicYear: '2026-2027',
      formType: 'bio',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    };

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        prisma.formInvitation.create({ data: { ...data, token: `race-token-${i}` } })
      )
    );

    const created = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter(
      (r) => r.status === 'rejected' && isUniqueViolation(r.reason)
    );
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(5);

    const count = await prisma.formInvitation.count({
      where: { fellowshipId: 7001, formType: 'bio', academicYear: '2026-2027' },
    });
    expect(count).toBe(1);
  });

  it('the bearer token is unique across invitations', async () => {
    await prisma.formInvitation.create({
      data: {
        token: 'shared-token',
        fellowshipId: 7010,
        contactId: 1,
        academicYear: '2026-2027',
        formType: 'bio',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      },
    });
    await expect(
      prisma.formInvitation.create({
        data: {
          token: 'shared-token',
          fellowshipId: 7011,
          contactId: 2,
          academicYear: '2026-2027',
          formType: 'bio',
          expiresAt: new Date('2027-01-01T00:00:00Z'),
        },
      })
    ).rejects.toSatisfy(isUniqueViolation);
  });
});

describe('representative persistence workflows', () => {
  it('claim log: writes and reads back a full VitIdClaim row', async () => {
    await prisma.vitIdClaim.create({
      data: {
        email: 'fellow@example.com',
        firstName: 'Bernard',
        lastName: 'Berenson',
        civicrmId: 42,
        hasFellowship: true,
        hasCurrentFellowship: false,
        rolesAssigned: ['fellows'],
        orgsAssigned: ['site1:former'],
      },
    });

    const rows = await prisma.vitIdClaim.findMany({ where: { email: 'fellow@example.com' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ civicrmId: 42, rolesAssigned: ['fellows'] });
    expect(rows[0].claimedAt).toBeInstanceOf(Date);
  });

  it('form workflow: invitation -> response with the FK and one-response-per-invitation enforced', async () => {
    const invitation = await prisma.formInvitation.create({
      data: {
        token: 'workflow-token',
        fellowshipId: 7100,
        contactId: 5,
        academicYear: '2026-2027',
        formType: 'bio',
        expiresAt: new Date('2027-01-01T00:00:00Z'),
      },
    });

    await prisma.formResponse.create({
      data: { invitationId: invitation.id, data: { bio: 'text' } },
    });
    await prisma.formInvitation.update({
      where: { id: invitation.id },
      data: { status: 'submitted', submittedAt: new Date() },
    });

    // One response per invitation.
    await expect(
      prisma.formResponse.create({
        data: { invitationId: invitation.id, data: { bio: 'second' } },
      })
    ).rejects.toSatisfy(isUniqueViolation);

    // FK: a response cannot point at a nonexistent invitation.
    await expect(
      prisma.formResponse.create({
        data: { invitationId: 'does-not-exist', data: {} },
      })
    ).rejects.toThrow();

    const roundTrip = await prisma.formInvitation.findUniqueOrThrow({
      where: { token: 'workflow-token' },
      include: { response: true },
    });
    expect(roundTrip.status).toBe('submitted');
    expect(roundTrip.response?.data).toEqual({ bio: 'text' });
  });
});

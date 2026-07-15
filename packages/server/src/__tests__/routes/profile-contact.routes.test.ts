import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../env.js', () => ({
  env: {
    CIVICRM_BASE_URL: 'https://civi.test',
    CIVICRM_API_KEY: 'test-key',
    CIVICRM_SITE_KEY: 'test-site-key',
  },
  isDevMode: false,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../services/contact-info.service.js', () => ({
  getAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  verifyOwnership: vi.fn(),
  isAddressPrimary: vi.fn(),
  setPrimary: vi.fn(),
  setPreferredAddress: vi.fn(),
  reclassifyAddress: vi.fn(),
  getUsedLocationTypes: vi.fn().mockResolvedValue([]),
  isLocationTypeDuplicate: vi.fn().mockReturnValue(false),
  getPhones: vi.fn(),
  createPhone: vi.fn(),
  updatePhone: vi.fn(),
  deletePhone: vi.fn(),
  isPhonePrimary: vi.fn(),
  getCountries: vi.fn(),
  getStateProvinces: vi.fn(),
}));

import { profileContactRoutes } from '../../routes/profile-contact.routes.js';
import * as contactInfoService from '../../services/contact-info.service.js';

const mockService = vi.mocked(contactInfoService);

function makeApp(civicrmId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { civicrmId?: string }).civicrmId = civicrmId;
    next();
  });
  app.use('/contact', profileContactRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Address routes ---

describe('GET /contact/addresses', () => {
  it('returns 400 when civicrmId is missing', async () => {
    const app = makeApp(undefined);
    const res = await request(app).get('/contact/addresses');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_CIVICRM_ID');
  });

  it('returns addresses for valid contact', async () => {
    mockService.getAddresses.mockResolvedValue([
      { id: 1, contactId: 42, streetAddress: '123 Main', city: 'Florence', countryId: 1107, locationTypeId: 3, locationType: 'Main' as const, isPrimary: true },
    ]);
    const app = makeApp('42');
    const res = await request(app).get('/contact/addresses');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].streetAddress).toBe('123 Main');
  });

  it('returns 503 when CiviCRM service throws', async () => {
    mockService.getAddresses.mockRejectedValue(new Error('timeout'));
    const app = makeApp('42');
    const res = await request(app).get('/contact/addresses');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('CIVICRM_UNAVAILABLE');
  });
});

describe('POST /contact/addresses', () => {
  it('returns 400 when required fields are missing', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/addresses').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('creates address with valid input', async () => {
    mockService.createAddress.mockResolvedValue({
      id: 10, contactId: 42, streetAddress: '1 Via Roma', city: 'Rome', countryId: 1107, locationTypeId: 3, locationType: 'Main' as const, isPrimary: true,
    });
    const app = makeApp('42');
    const res = await request(app).post('/contact/addresses').send({
      streetAddress: '1 Via Roma',
      city: 'Rome',
      countryId: 1107,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
  });

  it('rejects invalid numeric identifiers before calling CiviCRM', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/addresses').send({
      streetAddress: '1 Via Roma',
      city: 'Rome',
      countryId: 'not-a-number',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockService.createAddress).not.toHaveBeenCalled();
  });
});

describe('PUT /contact/addresses/:id', () => {
  it('returns 400 for non-numeric ID', async () => {
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/abc').send({ city: 'Rome' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when address belongs to another contact', async () => {
    mockService.verifyOwnership.mockResolvedValue(false);
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1').send({ city: 'Rome' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('updates address when owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.updateAddress.mockResolvedValue(undefined);
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1').send({ city: 'Milan' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockService.updateAddress).toHaveBeenCalledWith(1, expect.objectContaining({ city: 'Milan' }));
  });

  it('allows locationTypeId=Main (3) when address is primary', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isAddressPrimary.mockResolvedValue(true);
    mockService.updateAddress.mockResolvedValue(undefined);
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1').send({ city: 'Milan', locationTypeId: 3 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects locationTypeId=Main (3) when address is not primary', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isAddressPrimary.mockResolvedValue(false);
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1').send({ city: 'Milan', locationTypeId: 3 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Main type is reserved for the primary address', code: 'VALIDATION_ERROR' });
  });
});

describe('DELETE /contact/addresses/:id', () => {
  it('returns 403 when not owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(false);
    const app = makeApp('42');
    const res = await request(app).delete('/contact/addresses/1');
    expect(res.status).toBe(403);
  });

  it('returns 400 when deleting primary address', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isAddressPrimary.mockResolvedValue(true);
    const app = makeApp('42');
    const res = await request(app).delete('/contact/addresses/1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_DELETE_PRIMARY');
  });

  it('deletes non-primary address when owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isAddressPrimary.mockResolvedValue(false);
    mockService.deleteAddress.mockResolvedValue(undefined);
    const app = makeApp('42');
    const res = await request(app).delete('/contact/addresses/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /contact/addresses/:id/preferred', () => {
  it('returns 403 when not owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(false);
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1/preferred');
    expect(res.status).toBe(403);
  });

  it('sets preferred address when owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.setPreferredAddress.mockResolvedValue({ oldPrimaryId: 2, oldPrimaryLocationType: 'Home' });
    const app = makeApp('42');
    const res = await request(app).put('/contact/addresses/1/preferred');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.oldPrimaryId).toBe(2);
    expect(res.body.oldPrimaryLocationType).toBe('Home');
    expect(mockService.setPreferredAddress).toHaveBeenCalledWith(42, 1);
  });
});

// --- Phone routes ---

describe('GET /contact/phones', () => {
  it('returns 400 when civicrmId is missing', async () => {
    const app = makeApp(undefined);
    const res = await request(app).get('/contact/phones');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_CIVICRM_ID');
  });

  it('returns phones for valid contact', async () => {
    mockService.getPhones.mockResolvedValue([
      { id: 1, contactId: 42, phone: '+39 055 603251', phoneTypeId: 1, phoneType: 'Phone', isPrimary: true },
    ]);
    const app = makeApp('42');
    const res = await request(app).get('/contact/phones');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('phone body validation', () => {
  it('rejects overlong phone values before calling CiviCRM', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/phones').send({
      phone: `+39 ${'1'.repeat(60)}`,
      phoneTypeId: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockService.createPhone).not.toHaveBeenCalled();
  });
});

describe('POST /contact/phones', () => {
  it('returns 400 when phone is missing', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/phones').send({ phoneTypeId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when phone has fewer than 7 digits', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/phones').send({ phone: '123', phoneTypeId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid phoneTypeId', async () => {
    const app = makeApp('42');
    const res = await request(app).post('/contact/phones').send({ phone: '+1 555 123 4567', phoneTypeId: 99 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('creates phone with valid input', async () => {
    mockService.createPhone.mockResolvedValue({
      id: 5, contactId: 42, phone: '+1 555 123 4567', phoneTypeId: 2, phoneType: 'Mobile', isPrimary: true,
    });
    const app = makeApp('42');
    const res = await request(app).post('/contact/phones').send({ phone: '+1 555 123 4567', phoneTypeId: 2 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });
});

describe('PUT /contact/phones/:id', () => {
  it('returns 403 when not owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(false);
    const app = makeApp('42');
    const res = await request(app).put('/contact/phones/1').send({ phone: '+1 555 999 0000' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when updated phone has too few digits', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    const app = makeApp('42');
    const res = await request(app).put('/contact/phones/1').send({ phone: '12' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid phoneTypeId on update', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    const app = makeApp('42');
    const res = await request(app).put('/contact/phones/1').send({ phoneTypeId: 5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('updates phone when owned and valid', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.updatePhone.mockResolvedValue(undefined);
    const app = makeApp('42');
    const res = await request(app).put('/contact/phones/1').send({ phone: '+1 555 999 0000' });
    expect(res.status).toBe(200);
    expect(mockService.updatePhone).toHaveBeenCalledWith(1, { phone: '+1 555 999 0000' });
  });
});

describe('DELETE /contact/phones/:id', () => {
  it('returns 400 when deleting primary phone', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isPhonePrimary.mockResolvedValue(true);
    const app = makeApp('42');
    const res = await request(app).delete('/contact/phones/1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_DELETE_PRIMARY');
  });

  it('deletes non-primary phone when owned', async () => {
    mockService.verifyOwnership.mockResolvedValue(true);
    mockService.isPhonePrimary.mockResolvedValue(false);
    mockService.deletePhone.mockResolvedValue(undefined);
    const app = makeApp('42');
    const res = await request(app).delete('/contact/phones/1');
    expect(res.status).toBe(200);
  });
});

// --- Reference data ---

describe('GET /contact/states', () => {
  it('returns 400 for invalid countryId', async () => {
    const app = makeApp('42');
    const res = await request(app).get('/contact/states?countryId=abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for countryId=0', async () => {
    const app = makeApp('42');
    const res = await request(app).get('/contact/states?countryId=0');
    expect(res.status).toBe(400);
  });

  it('returns states for valid countryId', async () => {
    mockService.getStateProvinces.mockResolvedValue([
      { id: 1020, name: 'Massachusetts', countryId: 1228 },
    ]);
    const app = makeApp('42');
    const res = await request(app).get('/contact/states?countryId=1228');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

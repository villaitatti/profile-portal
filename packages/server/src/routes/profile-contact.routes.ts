import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import { parseCiviCRMError } from '../lib/civicrm-error.js';
import * as contactInfoService from '../services/contact-info.service.js';
import {
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_MAIN_ID,
  SELECTABLE_LOCATION_TYPE_IDS,
} from '@itatti/shared';
import type {
  CiviCRMAddress,
  CiviCRMPhone,
  CreateAddressInput,
  CreatePhoneInput,
} from '@itatti/shared';
import { z } from 'zod';
import { validate, idParamsSchema } from '../middleware/validate.js';

// ── Schemas ─────────────────────────────────────────────────────────
//
// These are the single source of validation truth for this router: handlers
// do NOT re-check what a schema already guarantees (an earlier version
// re-validated required fields and location-type membership by hand after the
// schema had run, giving two sources of truth that could drift).

const optionalText = (max: number) => z.string().trim().max(max).optional();
const positiveId = z.coerce.number().int().positive();

const selectableLocationTypeId = z.coerce
  .number()
  .int()
  .refine((value) => SELECTABLE_LOCATION_TYPE_IDS.includes(value), {
    message: 'Please choose a valid location type: Home, Work, Other, or Temporary.',
  });

const addressCreateSchema = z
  .object({
    streetAddress: z.string().trim().min(1).max(255),
    supplementalAddress1: optionalText(255),
    city: z.string().trim().min(1).max(120),
    postalCode: optionalText(32),
    stateProvinceId: positiveId.optional(),
    countryId: positiveId,
    locationTypeId: selectableLocationTypeId.optional(),
  })
  .strict();

const addressUpdateSchema = z
  .object({
    streetAddress: z.string().trim().min(1).max(255).optional(),
    supplementalAddress1: optionalText(255),
    city: z.string().trim().min(1).max(120).optional(),
    postalCode: optionalText(32),
    stateProvinceId: positiveId.optional(),
    countryId: positiveId.optional(),
    // Update additionally allows Main — but only on the primary address,
    // which is a data-dependent rule enforced in the handler.
    locationTypeId: z.coerce
      .number()
      .int()
      .refine(
        (value) =>
          value === LOCATION_TYPE_MAIN_ID || SELECTABLE_LOCATION_TYPE_IDS.includes(value),
        {
          message: 'Please choose a valid location type: Home, Work, Other, or Temporary.',
        }
      )
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const addressReclassifySchema = z
  .object({
    locationTypeId: selectableLocationTypeId,
  })
  .strict();

const phoneValue = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine((value) => value.replace(/\D/g, '').length >= 7, 'Phone number must have at least 7 digits');

const phoneTypeId = z.coerce
  .number()
  .int()
  .refine((value) => value === 1 || value === 2, {
    message: 'Please choose a valid phone type: Phone or Mobile.',
  });

const phoneCreateSchema = z
  .object({
    phone: phoneValue,
    phoneTypeId,
  })
  .strict();

const phoneUpdateSchema = z
  .object({
    phone: phoneValue.optional(),
    phoneTypeId: phoneTypeId.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const statesQuerySchema = z.object({ countryId: positiveId.optional() });

// ── Contact context ─────────────────────────────────────────────────

// Every route in this router acts on the logged-in user's own CiviCRM records.
// The guard resolves the numeric contact id once (from the token claim set by
// extractUser) so handlers don't repeat the same 400 check eight times.
function requireCivicrmContact(req: Request, res: Response, next: NextFunction) {
  // Same positive-integer rule as every other id in the codebase. The token
  // claim is trusted input, but "0", negatives, and decimals were previously
  // let through by a bare isFinite check and would only fail deep inside
  // CiviCRM calls.
  const parsed = positiveId.safeParse(req.civicrmId);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }
  req.civicrmContactId = parsed.data;
  next();
}

const router = Router();

// --- Address routes ---

router.get('/addresses', requireCivicrmContact, async (req, res) => {
  if (isDevMode) {
    const mockAddresses: CiviCRMAddress[] = [
      {
        id: 1,
        contactId: 99999,
        streetAddress: 'Via di Vincigliata 26',
        city: 'Florence',
        postalCode: '50135',
        countryId: 1107,
        country: 'Italy',
        locationTypeId: 3,
        locationType: 'Main',
        isPrimary: true,
      },
      {
        id: 2,
        contactId: 99999,
        streetAddress: '123 Main St, Apt 4B',
        city: 'Cambridge',
        postalCode: '02139',
        stateProvinceId: 1020,
        stateProvince: 'Massachusetts',
        countryId: 1228,
        country: 'United States',
        locationTypeId: 1,
        locationType: 'Home',
        isPrimary: false,
      },
    ];
    res.json(mockAddresses);
    return;
  }

  const contactId = req.civicrmContactId!;
  try {
    const addresses = await contactInfoService.getAddresses(contactId);
    res.json(addresses);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to fetch addresses');
    res.status(503).json({ error: 'Unable to load addresses', code: 'CIVICRM_UNAVAILABLE' });
  }
});

router.post(
  '/addresses',
  requireCivicrmContact,
  validate(addressCreateSchema),
  async (req, res) => {
    const contactId = req.civicrmContactId!;
    // validate() replaced req.body with the parsed data: strings are trimmed,
    // ids are numbers, locationTypeId (when present) is a selectable type.
    const { streetAddress, supplementalAddress1, city, postalCode, stateProvinceId, countryId, locationTypeId } =
      req.body as z.infer<typeof addressCreateSchema>;

    try {
      if (locationTypeId) {
        const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId);
        if (contactInfoService.isLocationTypeDuplicate(usedTypes, locationTypeId)) {
          const label = LOCATION_TYPE_LABELS[locationTypeId] || 'this type';
          res.status(400).json({
            error: `You already have a ${label} address. Please choose a different type.`,
            code: 'DUPLICATE_LOCATION_TYPE',
          });
          return;
        }
      }

      const input: CreateAddressInput = {
        streetAddress,
        supplementalAddress1: supplementalAddress1 || undefined,
        city,
        postalCode: postalCode || undefined,
        stateProvinceId,
        countryId,
        locationTypeId,
      };

      const created = await contactInfoService.createAddress(contactId, input);
      res.status(201).json(created);
    } catch (err) {
      logger.error({ err, contactId }, 'Failed to create address');
      const parsed = parseCiviCRMError(err, 'Failed to create address. Please try again.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
    }
  }
);

router.put(
  '/addresses/:id',
  requireCivicrmContact,
  validate(addressUpdateSchema),
  async (req, res) => {
    const contactId = req.civicrmContactId!;
    const { id: recordId } = idParamsSchema.parse(req.params);
    const body = req.body as z.infer<typeof addressUpdateSchema>;

    try {
      const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
      if (!owned) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }

      const { streetAddress, supplementalAddress1, city, postalCode, stateProvinceId, countryId, locationTypeId } = body;

      // Main is only valid on the primary address — a data-dependent rule the
      // schema can't know.
      if (locationTypeId === LOCATION_TYPE_MAIN_ID) {
        const isPrimary = await contactInfoService.isAddressPrimary(recordId);
        if (!isPrimary) {
          res.status(400).json({ error: 'Main type is reserved for the primary address', code: 'VALIDATION_ERROR' });
          return;
        }
      }

      if (locationTypeId !== undefined && locationTypeId !== LOCATION_TYPE_MAIN_ID) {
        const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId, recordId);
        if (contactInfoService.isLocationTypeDuplicate(usedTypes, locationTypeId)) {
          const label = LOCATION_TYPE_LABELS[locationTypeId] || 'this type';
          res.status(400).json({
            error: `You already have a ${label} address. Please choose a different type.`,
            code: 'DUPLICATE_LOCATION_TYPE',
          });
          return;
        }
      }

      const input: Record<string, unknown> = {};
      if (streetAddress !== undefined) input.streetAddress = streetAddress;
      if (supplementalAddress1 !== undefined) input.supplementalAddress1 = supplementalAddress1;
      if (city !== undefined) input.city = city;
      if (postalCode !== undefined) input.postalCode = postalCode;
      if (stateProvinceId !== undefined) input.stateProvinceId = stateProvinceId;
      if (countryId !== undefined) input.countryId = countryId;
      if (locationTypeId !== undefined) input.locationTypeId = locationTypeId;

      await contactInfoService.updateAddress(recordId, input);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err, contactId, recordId }, 'Failed to update address');
      const parsed = parseCiviCRMError(err, 'Failed to update address. Please try again.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
    }
  }
);

router.delete('/addresses/:id', requireCivicrmContact, async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { id: recordId } = idParamsSchema.parse(req.params);

  try {
    const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const isPrimary = await contactInfoService.isAddressPrimary(recordId);
    if (isPrimary) {
      res.status(400).json({
        error: 'Cannot delete the preferred address. Please select a different preferred address first.',
        code: 'CANNOT_DELETE_PRIMARY',
      });
      return;
    }

    await contactInfoService.deleteAddress(recordId);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to delete address');
    const parsed = parseCiviCRMError(err, 'Failed to delete address. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.put('/addresses/:id/preferred', requireCivicrmContact, async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { id: recordId } = idParamsSchema.parse(req.params);

  try {
    const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const result = await contactInfoService.setPreferredAddress(contactId, recordId);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to set preferred address');
    const parsed = parseCiviCRMError(err, 'Failed to set preferred address. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.put(
  '/addresses/:id/reclassify',
  requireCivicrmContact,
  validate(addressReclassifySchema),
  async (req, res) => {
    const contactId = req.civicrmContactId!;
    const { id: recordId } = idParamsSchema.parse(req.params);
    const { locationTypeId } = req.body as z.infer<typeof addressReclassifySchema>;

    try {
      const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
      if (!owned) {
        res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        return;
      }

      const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId, recordId);
      if (contactInfoService.isLocationTypeDuplicate(usedTypes, locationTypeId)) {
        const label = LOCATION_TYPE_LABELS[locationTypeId] || 'this type';
        res.status(400).json({
          error: `You already have a ${label} address. Please choose a different type.`,
          code: 'DUPLICATE_LOCATION_TYPE',
        });
        return;
      }

      await contactInfoService.reclassifyAddress(recordId, locationTypeId);
      res.json({ success: true });
    } catch (err) {
      logger.warn({ err, contactId, recordId }, 'Failed to reclassify address');
      const parsed = parseCiviCRMError(err, 'Could not update address type. You can edit it manually.');
      res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
    }
  }
);

// --- Phone routes ---

router.get('/phones', requireCivicrmContact, async (req, res) => {
  if (isDevMode) {
    const mockPhones: CiviCRMPhone[] = [
      {
        id: 1,
        contactId: 99999,
        phone: '+39 055 603251',
        phoneTypeId: 1,
        phoneType: 'Phone',
        isPrimary: true,
      },
      {
        id: 2,
        contactId: 99999,
        phone: '+1 617 555 0123',
        phoneTypeId: 2,
        phoneType: 'Mobile',
        isPrimary: false,
      },
    ];
    res.json(mockPhones);
    return;
  }

  const contactId = req.civicrmContactId!;
  try {
    const phones = await contactInfoService.getPhones(contactId);
    res.json(phones);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to fetch phones');
    res.status(503).json({ error: 'Unable to load phone numbers', code: 'CIVICRM_UNAVAILABLE' });
  }
});

router.post('/phones', requireCivicrmContact, validate(phoneCreateSchema), async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { phone, phoneTypeId: typeId } = req.body as z.infer<typeof phoneCreateSchema>;

  const input: CreatePhoneInput = { phone, phoneTypeId: typeId };

  try {
    const created = await contactInfoService.createPhone(contactId, input);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to create phone');
    const parsed = parseCiviCRMError(err, 'Failed to save phone number. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.put('/phones/:id', requireCivicrmContact, validate(phoneUpdateSchema), async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { id: recordId } = idParamsSchema.parse(req.params);
  const { phone, phoneTypeId: typeId } = req.body as z.infer<typeof phoneUpdateSchema>;

  try {
    const owned = await contactInfoService.verifyOwnership('Phone', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const input: Record<string, unknown> = {};
    if (phone !== undefined) input.phone = phone;
    if (typeId !== undefined) input.phoneTypeId = typeId;

    await contactInfoService.updatePhone(recordId, input);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to update phone');
    const parsed = parseCiviCRMError(err, 'Failed to update phone number. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.delete('/phones/:id', requireCivicrmContact, async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { id: recordId } = idParamsSchema.parse(req.params);

  try {
    const owned = await contactInfoService.verifyOwnership('Phone', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const isPrimary = await contactInfoService.isPhonePrimary(recordId);
    if (isPrimary) {
      res.status(400).json({
        error: 'Cannot delete the preferred phone number. Please select a different preferred number first.',
        code: 'CANNOT_DELETE_PRIMARY',
      });
      return;
    }

    await contactInfoService.deletePhone(recordId);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to delete phone');
    const parsed = parseCiviCRMError(err, 'Failed to delete phone number. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.put('/phones/:id/preferred', requireCivicrmContact, async (req, res) => {
  const contactId = req.civicrmContactId!;
  const { id: recordId } = idParamsSchema.parse(req.params);

  try {
    const owned = await contactInfoService.verifyOwnership('Phone', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    await contactInfoService.setPrimary('Phone', recordId);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to set preferred phone');
    const parsed = parseCiviCRMError(err, 'Failed to set preferred phone number. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

// --- Reference data routes ---

router.get('/countries', async (_req, res) => {
  try {
    const countries = await contactInfoService.getCountries();
    res.json(countries);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch countries');
    res.status(503).json({ error: 'Unable to load countries', code: 'CIVICRM_UNAVAILABLE' });
  }
});

router.get('/states', async (req, res) => {
  const { countryId } = statesQuerySchema.parse(req.query);

  try {
    const states = await contactInfoService.getStateProvinces(countryId);
    res.json(states);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch state/provinces');
    res.status(503).json({ error: 'Unable to load states/provinces', code: 'CIVICRM_UNAVAILABLE' });
  }
});

export { router as profileContactRoutes };

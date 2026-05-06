import { Router } from 'express';
import { isDevMode } from '../env.js';
import { logger } from '../lib/logger.js';
import { parseCiviCRMError } from '../lib/civicrm-error.js';
import * as contactInfoService from '../services/contact-info.service.js';
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_MAIN_ID } from '@itatti/shared';
import type {
  CiviCRMAddress,
  CiviCRMPhone,
  CreateAddressInput,
  CreatePhoneInput,
} from '@itatti/shared';

const router = Router();

function getCivicrmId(req: Express.Request): number | null {
  const id = (req as { civicrmId?: string }).civicrmId;
  if (!id) return null;
  const num = Number(id);
  return Number.isFinite(num) ? num : null;
}

// --- Address routes ---

router.get('/addresses', async (req, res) => {
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

  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  try {
    const addresses = await contactInfoService.getAddresses(contactId);
    res.json(addresses);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to fetch addresses');
    res.status(503).json({ error: 'Unable to load addresses', code: 'CIVICRM_UNAVAILABLE' });
  }
});

router.post('/addresses', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const { streetAddress, supplementalAddress1, city, postalCode, stateProvinceId, countryId, locationTypeId } = req.body;

  if (!streetAddress || !city || !countryId) {
    res.status(400).json({ error: 'Street address, city, and country are required', code: 'VALIDATION_ERROR' });
    return;
  }

  if (locationTypeId !== undefined && ![1, 2, 4, 6].includes(Number(locationTypeId))) {
    res.status(400).json({ error: 'Location type must be Home (1), Work (2), Other (4), or Temporary (6)', code: 'VALIDATION_ERROR' });
    return;
  }

  const parsedLocationTypeId = locationTypeId ? Number(locationTypeId) : undefined;

  try {
    if (parsedLocationTypeId) {
      const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId);
      if (contactInfoService.isLocationTypeDuplicate(usedTypes, parsedLocationTypeId)) {
        const label = LOCATION_TYPE_LABELS[parsedLocationTypeId] || 'this type';
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
      stateProvinceId: stateProvinceId ? Number(stateProvinceId) : undefined,
      countryId: Number(countryId),
      locationTypeId: parsedLocationTypeId,
    };

    const created = await contactInfoService.createAddress(contactId, input);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to create address');
    const parsed = parseCiviCRMError(err, 'Failed to create address. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.put('/addresses/:id', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid address ID', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const { streetAddress, supplementalAddress1, city, postalCode, stateProvinceId, countryId, locationTypeId } = req.body;

    if (locationTypeId !== undefined) {
      const typeNum = Number(locationTypeId);
      if (typeNum === LOCATION_TYPE_MAIN_ID) {
        const isPrimary = await contactInfoService.isAddressPrimary(recordId);
        if (!isPrimary) {
          res.status(400).json({ error: 'Main type is reserved for the primary address', code: 'VALIDATION_ERROR' });
          return;
        }
      } else if (![1, 2, 4, 5].includes(typeNum)) {
        res.status(400).json({ error: 'Location type must be Home (1), Work (2), Other (4), or Temporary (6)', code: 'VALIDATION_ERROR' });
        return;
      }
    }

    if (locationTypeId !== undefined && Number(locationTypeId) !== LOCATION_TYPE_MAIN_ID) {
      const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId, recordId);
      if (contactInfoService.isLocationTypeDuplicate(usedTypes, Number(locationTypeId))) {
        const label = LOCATION_TYPE_LABELS[Number(locationTypeId)] || 'this type';
        res.status(400).json({
          error: `You already have a ${label} address. Please choose a different type.`,
          code: 'DUPLICATE_LOCATION_TYPE',
        });
        return;
      }
    }

    const input: Record<string, unknown> = {};
    if (streetAddress !== undefined) input.streetAddress = String(streetAddress);
    if (supplementalAddress1 !== undefined) input.supplementalAddress1 = String(supplementalAddress1);
    if (city !== undefined) input.city = String(city);
    if (postalCode !== undefined) input.postalCode = String(postalCode);
    if (stateProvinceId !== undefined) input.stateProvinceId = stateProvinceId ? Number(stateProvinceId) : undefined;
    if (countryId !== undefined) input.countryId = Number(countryId);
    if (locationTypeId !== undefined) input.locationTypeId = Number(locationTypeId);

    await contactInfoService.updateAddress(recordId, input);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to update address');
    const parsed = parseCiviCRMError(err, 'Failed to update address. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.delete('/addresses/:id', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid address ID', code: 'VALIDATION_ERROR' });
    return;
  }

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

router.put('/addresses/:id/preferred', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid address ID', code: 'VALIDATION_ERROR' });
    return;
  }

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

router.put('/addresses/:id/reclassify', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid address ID', code: 'VALIDATION_ERROR' });
    return;
  }

  const { locationTypeId } = req.body;
  if (!locationTypeId || ![1, 2, 4, 6].includes(Number(locationTypeId))) {
    res.status(400).json({ error: 'Location type must be Home (1), Work (2), Other (4), or Temporary (6)', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const owned = await contactInfoService.verifyOwnership('Address', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const usedTypes = await contactInfoService.getUsedLocationTypes('Address', contactId, recordId);
    if (contactInfoService.isLocationTypeDuplicate(usedTypes, Number(locationTypeId))) {
      const label = LOCATION_TYPE_LABELS[Number(locationTypeId)] || 'this type';
      res.status(400).json({
        error: `You already have a ${label} address. Please choose a different type.`,
        code: 'DUPLICATE_LOCATION_TYPE',
      });
      return;
    }

    await contactInfoService.reclassifyAddress(recordId, Number(locationTypeId));
    res.json({ success: true });
  } catch (err) {
    logger.warn({ err, contactId, recordId }, 'Failed to reclassify address');
    const parsed = parseCiviCRMError(err, 'Could not update address type. You can edit it manually.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

// --- Phone routes ---

router.get('/phones', async (req, res) => {
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

  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  try {
    const phones = await contactInfoService.getPhones(contactId);
    res.json(phones);
  } catch (err) {
    logger.error({ err, contactId }, 'Failed to fetch phones');
    res.status(503).json({ error: 'Unable to load phone numbers', code: 'CIVICRM_UNAVAILABLE' });
  }
});

router.post('/phones', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const { phone, phoneTypeId } = req.body;

  if (!phone) {
    res.status(400).json({ error: 'Phone number is required', code: 'VALIDATION_ERROR' });
    return;
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) {
    res.status(400).json({ error: 'Phone number must have at least 7 digits', code: 'VALIDATION_ERROR' });
    return;
  }

  const typeId = Number(phoneTypeId);
  if (typeId !== 1 && typeId !== 2) {
    res.status(400).json({ error: 'Phone type must be Phone (1) or Mobile (2)', code: 'VALIDATION_ERROR' });
    return;
  }

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

router.put('/phones/:id', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid phone ID', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const owned = await contactInfoService.verifyOwnership('Phone', recordId, contactId);
    if (!owned) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }

    const { phone, phoneTypeId } = req.body;
    if (phone) {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length < 7) {
        res.status(400).json({ error: 'Phone number must have at least 7 digits', code: 'VALIDATION_ERROR' });
        return;
      }
    }
    if (phoneTypeId !== undefined) {
      const typeId = Number(phoneTypeId);
      if (typeId !== 1 && typeId !== 2) {
        res.status(400).json({ error: 'Phone type must be Phone (1) or Mobile (2)', code: 'VALIDATION_ERROR' });
        return;
      }
    }

    const input: Record<string, unknown> = {};
    if (phone !== undefined) input.phone = String(phone);
    if (phoneTypeId !== undefined) input.phoneTypeId = Number(phoneTypeId);

    await contactInfoService.updatePhone(recordId, input);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, contactId, recordId }, 'Failed to update phone');
    const parsed = parseCiviCRMError(err, 'Failed to update phone number. Please try again.');
    res.status(parsed.status).json({ error: parsed.message, code: parsed.code });
  }
});

router.delete('/phones/:id', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid phone ID', code: 'VALIDATION_ERROR' });
    return;
  }

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

router.put('/phones/:id/preferred', async (req, res) => {
  const contactId = getCivicrmId(req);
  if (!contactId) {
    res.status(400).json({ error: 'Missing CiviCRM contact ID', code: 'NO_CIVICRM_ID' });
    return;
  }

  const recordId = Number(req.params.id);
  if (!Number.isFinite(recordId)) {
    res.status(400).json({ error: 'Invalid phone ID', code: 'VALIDATION_ERROR' });
    return;
  }

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
  const raw = req.query.countryId ? Number(req.query.countryId) : undefined;
  if (raw !== undefined && (!Number.isFinite(raw) || raw <= 0)) {
    res.status(400).json({ error: 'Invalid countryId', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const states = await contactInfoService.getStateProvinces(raw);
    res.json(states);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch state/provinces');
    res.status(503).json({ error: 'Unable to load states/provinces', code: 'CIVICRM_UNAVAILABLE' });
  }
});

export { router as profileContactRoutes };

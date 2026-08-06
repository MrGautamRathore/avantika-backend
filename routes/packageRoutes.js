const express = require('express');
const Package = require('../models/Package');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const slugify = require('../utils/slugify');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

const VALID_TYPES = ['group', 'personal'];
const normalizeType = (type) => (VALID_TYPES.includes(type) ? type : 'group');

// Helper: normalize personPricing (1-12 persons) with default = base price
// Only relevant for 'personal' type packages — 'group' packages never carry a personPricing table.
function normalizePersonPricing(personPricing, basePrice, type) {
  if (normalizeType(type) === 'group') return [];

  const base = Number(basePrice) || 0;
  let parsed = personPricing;

  // If sent as a JSON string (FormData), parse it
  if (typeof personPricing === 'string' && personPricing.trim()) {
    try {
      parsed = JSON.parse(personPricing);
    } catch (e) {
      parsed = null;
    }
  }

  const priceMap = new Map();
  if (Array.isArray(parsed)) {
    parsed.forEach(p => {
      const persons = Number(p.persons);
      const price = Number(p.price);
      if (persons >= 1 && persons <= 12 && !isNaN(price)) {
        priceMap.set(persons, price);
      }
    });
  }

  // Always ensure entries for persons 1-12, defaulting to base price
  const normalized = [];
  for (let i = 1; i <= 12; i++) {
    const price = priceMap.has(i) ? priceMap.get(i) : base;
    normalized.push({ persons: i, price });
  }
  return normalized;
}

// Helper: ensure a package document is safe to send in a GET response.
// - 'personal' packages without personPricing get a default 1-12 table (base price) — for old docs.
// - 'group' packages should never carry a personPricing table.
function ensurePersonPricing(packageDoc) {
  if (!packageDoc) return packageDoc;

  const type = normalizeType(packageDoc.type);

  if (type === 'group') {
    if (packageDoc.personPricing && packageDoc.personPricing.length > 0) {
      packageDoc.personPricing = [];
    }
    return packageDoc;
  }

  // type === 'personal'
  if (!packageDoc.personPricing || packageDoc.personPricing.length === 0) {
    const base = Number(packageDoc.price) || 0;
    packageDoc.personPricing = Array.from({ length: 12 }, (_, i) => ({ persons: i + 1, price: base }));
  }
  return packageDoc;
}

// Get all packages
router.get('/', async (req, res) => {
  try {
    const packages = await Package.find().maxTimeMS(30000);
    packages.forEach(ensurePersonPricing);
    res.json(packages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get filtered packages
router.get('/filter', async (req, res) => {
  try {
    const { category, destination, type } = req.query;
    let filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (destination && destination !== 'all') {
      filter.destination = destination;
    }

    if (type && type !== 'all' && VALID_TYPES.includes(type)) {
      filter.type = type;
    }

    const packages = await Package.find(filter).maxTimeMS(30000);
    packages.forEach(ensurePersonPricing);
    res.json(packages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single package
router.get('/:id', async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    if (!package) return res.status(404).json({ message: 'Package not found' });
    ensurePersonPricing(package);
    res.json(package);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create package (admin only)
router.post('/', auth, upload.array('images', 10), async (req, res) => {
  try {
    const packageData = { ...req.body };
    if (packageData.name && !packageData.slug) {
      packageData.slug = slugify(packageData.name);
    }

    // Normalize package type (defaults to 'group' if missing/invalid)
    packageData.type = normalizeType(packageData.type);

    // Handle image uploads
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/packages',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
    }
    packageData.images = uploadedImages;

    // Normalize per-person pricing — empty for 'group', 1-12 table for 'personal'
    packageData.personPricing = normalizePersonPricing(packageData.personPricing, packageData.price, packageData.type);

    const package = new Package(packageData);
    const newPackage = await package.save();
    res.status(201).json(newPackage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update package (admin only)
router.put('/:id', auth, upload.array('images', 10), async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (updateData.name && !updateData.slug) {
      updateData.slug = slugify(updateData.name);
    }

    if (updateData.type != null) {
      updateData.type = normalizeType(updateData.type);
    }

    // Handle image uploads if new images are provided
    if (req.files && req.files.length > 0) {
      const oldPackage = await Package.findById(req.params.id);
      if (oldPackage && oldPackage.images && oldPackage.images.length > 0) {
        for (const image of oldPackage.images) {
          if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
          }
        }
      }

      const uploadedImages = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/packages',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
      updateData.images = uploadedImages;
    }

    // Load existing package to handle personPricing / type defaults correctly
    const existingPackage = await Package.findById(req.params.id);
    if (!existingPackage) return res.status(404).json({ message: 'Package not found' });

    // Determine the effective type & price after this update
    const effectiveType = updateData.type != null ? updateData.type : normalizeType(existingPackage.type);
    const effectivePrice = updateData.price != null ? Number(updateData.price) : existingPackage.price;
    const typeChanged = updateData.type != null && updateData.type !== normalizeType(existingPackage.type);

    if (effectiveType === 'group') {
      // Group packages never carry a personPricing table — always clear it
      updateData.personPricing = [];
    } else if (updateData.personPricing) {
      // Explicit per-person pricing sent -> normalize it (1-12, default = effective base price)
      updateData.personPricing = normalizePersonPricing(updateData.personPricing, effectivePrice, effectiveType);
    } else if (updateData.price != null || typeChanged) {
      // Base price changed, or package just switched from group -> personal:
      // rebuild the table from whatever existing entries there are, filling gaps with the new base price
      updateData.personPricing = normalizePersonPricing(existingPackage.personPricing, effectivePrice, effectiveType);
    }
    // else: personal type, nothing price/type-related changed -> leave existing personPricing untouched

    // Apply updates to the existing document
    Object.keys(updateData).forEach((key) => {
      existingPackage[key] = updateData[key];
    });

    const updatedPackage = await existingPackage.save();
    res.json(updatedPackage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete package (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const package = await Package.findById(req.params.id);
    if (!package) return res.status(404).json({ message: 'Package not found' });

    if (package.images && package.images.length > 0) {
      for (const image of package.images) {
        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }
      }
    }

    await Package.findByIdAndDelete(req.params.id);
    res.json({ message: 'Package deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
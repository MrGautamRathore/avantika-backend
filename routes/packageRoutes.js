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

// Get all packages
router.get('/', async (req, res) => {
  try {
    const packages = await Package.find().maxTimeMS(30000);
    res.json(packages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get filtered packages
router.get('/filter', async (req, res) => {
  try {
    const { category, destination } = req.query;
    let filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (destination && destination !== 'all') {
      filter.destination = destination;
    }

    const packages = await Package.find(filter).maxTimeMS(30000);
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

    // Handle image uploads if new images are provided
    if (req.files && req.files.length > 0) {
      // First, get the existing package to delete old images
      const existingPackage = await Package.findById(req.params.id);
      if (existingPackage && existingPackage.images && existingPackage.images.length > 0) {
        for (const image of existingPackage.images) {
          if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
          }
        }
      }

      // Upload new images
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

    const updatedPackage = await Package.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedPackage) return res.status(404).json({ message: 'Package not found' });
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

    // Delete images from Cloudinary if they exist
    if (package.images && package.images.length > 0) {
      for (const image of package.images) {
        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }
      }
    }

    // Delete package from database
    await Package.findByIdAndDelete(req.params.id);
    res.json({ message: 'Package deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



module.exports = router;

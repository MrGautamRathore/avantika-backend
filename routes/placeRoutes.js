const express = require('express');
const Place = require('../models/Place');
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

// Get all places
router.get('/', async (req, res) => {
  try {
    const places = await Place.find().maxTimeMS(30000);
    res.json(places);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single place
router.get('/:id', async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });
    res.json(place);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create place (admin only)
router.post('/', auth, upload.array('images', 10), async (req, res) => {
  try {
    const placeData = { ...req.body };
    if (placeData.title && !placeData.slug) {
      placeData.slug = slugify(placeData.title);
    }

    // Handle image uploads
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/places',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
    }
    placeData.images = uploadedImages;

    const place = new Place(placeData);
    const newPlace = await place.save();
    res.status(201).json(newPlace);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update place (admin only)
router.put('/:id', auth, upload.array('images', 10), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Get the existing place to handle image deletions
    const existingPlace = await Place.findById(req.params.id);
    if (!existingPlace) return res.status(404).json({ message: 'Place not found' });

    // Handle image uploads if new images are provided via files
    if (req.files && req.files.length > 0) {
      // Delete old images if they exist
      if (existingPlace.images && existingPlace.images.length > 0) {
        for (const image of existingPlace.images) {
          if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
          }
        }
      }

      // Upload new images
      const uploadedImages = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/places',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
      updateData.images = uploadedImages;
    }
    // Handle image updates if images array is provided in body (no new file uploads)
    else if (req.body.images !== undefined) {
      // Delete old images if they exist
      if (existingPlace.images && existingPlace.images.length > 0) {
        for (const image of existingPlace.images) {
          if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
          }
        }
      }
      // Set the new images array (could be empty if all images were removed)
      updateData.images = req.body.images;
    }

    const updatedPlace = await Place.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedPlace);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete place (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ message: 'Place not found' });

    // Delete images from Cloudinary if they exist
    if (place.images && place.images.length > 0) {
      for (const image of place.images) {
        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }
      }
    }

    // Delete place from database
    await Place.findByIdAndDelete(req.params.id);
    res.json({ message: 'Place deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload images endpoint (admin only)
router.post('/upload-images', auth, upload.array('images', 10), async (req, res) => {
  try {
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/places',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
    }
    res.status(200).json(uploadedImages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

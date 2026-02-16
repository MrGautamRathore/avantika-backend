const express = require('express');
const Gallery = require('../models/Gallery');
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

// Get all galleries
router.get('/', async (req, res) => {
  try {
    const galleries = await Gallery.find().maxTimeMS(30000);
    res.json(galleries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single gallery
router.get('/:id', async (req, res) => {
  try {
    const gallery = await Gallery.findById(req.params.id);
    if (!gallery) return res.status(404).json({ message: 'Gallery not found' });
    res.json(gallery);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get gallery by slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const gallery = await Gallery.findOne({ slug: req.params.slug });
    if (!gallery) return res.status(404).json({ message: 'Gallery not found' });
    res.json(gallery);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create gallery (admin only)
router.post('/', auth, upload.array('images', 10), async (req, res) => {
  try {
    const galleryData = { ...req.body };

    // Convert string values to appropriate types
    if (galleryData.status === 'true') galleryData.status = true;
    if (galleryData.status === 'false') galleryData.status = false;

    if (galleryData.name && !galleryData.slug) {
      galleryData.slug = slugify(galleryData.name);
    }

    // Handle image uploads
    const uploadedImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/galleries',
          resource_type: 'image'
        });
        uploadedImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
    }
    galleryData.images = uploadedImages;

    const gallery = new Gallery(galleryData);
    const newGallery = await gallery.save();
    res.status(201).json(newGallery);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update gallery (admin only)
router.put('/:id', auth, upload.array('images', 10), async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.name && !updateData.slug) {
      updateData.slug = slugify(updateData.name);
    }

    // Convert string values to appropriate types
    if (updateData.status === 'true') updateData.status = true;
    if (updateData.status === 'false') updateData.status = false;

    // Get existing gallery
    const existingGallery = await Gallery.findById(req.params.id);
    if (!existingGallery) return res.status(404).json({ message: 'Gallery not found' });

    // Handle image management
    let finalImages = [];

    // Parse existing images to keep (sent as JSON string of public_ids)
    if (updateData.existingImages !== undefined) {
      try {
        const existingPublicIdsToKeep = JSON.parse(updateData.existingImages);
        
        // Only filter if the array is not empty
        if (Array.isArray(existingPublicIdsToKeep) && existingPublicIdsToKeep.length > 0) {
          // Find the corresponding image objects from the existing gallery
          finalImages = existingGallery.images.filter(img =>
            existingPublicIdsToKeep.includes(img.public_id)
          );
        } else if (Array.isArray(existingPublicIdsToKeep) && existingPublicIdsToKeep.length === 0) {
          // Empty array means user wants to remove all images
          finalImages = [];
        } else {
          // If existingImages is not a valid array, keep all existing images
          finalImages = existingGallery.images || [];
        }
      } catch (error) {
        console.error('Error parsing existing images:', error);
        // On error, keep existing images
        finalImages = existingGallery.images || [];
      }
    } else {
      // If existingImages is not provided at all, keep all existing images
      finalImages = existingGallery.images || [];
    }

    // Upload new images if provided
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
          folder: 'avantika-travels/galleries',
          resource_type: 'image'
        });
        finalImages.push({
          public_id: result.public_id,
          url: result.secure_url
        });
      }
    }

    // Delete images that are no longer in the final list
    if (existingGallery.images && existingGallery.images.length > 0) {
      const imagesToDelete = existingGallery.images.filter(existingImg =>
        !finalImages.some(finalImg => finalImg.public_id === existingImg.public_id)
      );

      for (const image of imagesToDelete) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (cloudinaryError) {
            console.error('Error deleting image from Cloudinary:', cloudinaryError);
          }
        }
      }
    }

    updateData.images = finalImages;

    const updatedGallery = await Gallery.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedGallery);
  } catch (error) {
    console.error('Error updating gallery:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete gallery (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const gallery = await Gallery.findById(req.params.id);
    if (!gallery) return res.status(404).json({ message: 'Gallery not found' });

    // Delete images from Cloudinary if they exist
    // We use try-catch for each image to ensure we don't fail the whole operation
    // if one image fails to delete
    if (gallery.images && gallery.images.length > 0) {
      for (const image of gallery.images) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (cloudinaryError) {
            console.error('Error deleting image from Cloudinary:', cloudinaryError.message);
            // Continue with other images even if one fails
          }
        }
      }
    }

    // Delete gallery from database
    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ message: 'Gallery deleted' });
  } catch (error) {
    console.error('Error deleting gallery:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

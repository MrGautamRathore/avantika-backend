const express = require('express');
const Blog = require('../models/Blog');
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

// Get all blogs
router.get('/', async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
    //console.log('All blogs', blogs);
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get published blogs
router.get('/published', async (req, res) => {
  try {
    const blogs = await Blog.find({ published: true }).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single blog
router.get('/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create blog (admin only)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const blogData = { ...req.body };

    // Handle image upload
    if (req.file) {
      const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
        folder: 'avantika-travels/blogs',
        resource_type: 'image'
      });
      blogData.image = {
        public_id: result.public_id,
        url: result.secure_url
      };
    }

    // Generate slug from title
    blogData.slug = slugify(blogData.title);

    const blog = new Blog(blogData);
    const newBlog = await blog.save();
    res.status(201).json(newBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update blog (admin only)
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Handle image upload if new image is provided
    if (req.file) {
      // First, get the existing blog to delete old image
      const existingBlog = await Blog.findById(req.params.id);
      if (existingBlog && existingBlog.image && existingBlog.image.public_id) {
        await cloudinary.uploader.destroy(existingBlog.image.public_id);
      }

      // Upload new image
      const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
        folder: 'avantika-travels/blogs',
        resource_type: 'image'
      });
      updateData.image = {
        public_id: result.public_id,
        url: result.secure_url
      };
    }

    // Generate slug from title if title is being updated
    if (updateData.title) {
      updateData.slug = slugify(updateData.title);
    }

    const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedBlog) return res.status(404).json({ message: 'Blog not found' });
    res.json(updatedBlog);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete blog (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Delete image from Cloudinary if it exists
    if (blog.image && blog.image.public_id) {
      await cloudinary.uploader.destroy(blog.image.public_id);
    }

    // Delete blog from database
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Blog deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

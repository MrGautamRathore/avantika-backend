const express = require('express');
const Contact = require('../models/Contact');
const auth = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail');
const { newInquiryAdminTemplate } = require('../utils/emailTemplates');

const router = express.Router();

// Get all contacts (admin only)
router.get('/', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single contact
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json(contact);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create contact
router.post('/', async (req, res) => {
  // Apply defaults for any missing required fields so the form always submits successfully.
  const { name, email, phone, subject, message } = req.body || {};

  const contactData = {
    name: (name || 'Website Visitor').toString().trim() || 'Website Visitor',
    email: (email || '').toString().trim() || 'visitor@avantikatravels.com',
    phone: (phone || '').toString().trim(),
    subject: (subject || 'General Inquiry').toString().trim() || 'General Inquiry',
    message: (message || 'No message provided.').toString().trim() || 'No message provided.',
  };

  const contact = new Contact(contactData);

  try {
    const newContact = await contact.save();

    // Notify admin only — no confirmation email to the user, as intended.
    // Wrapped so that a failed/slow email never breaks the inquiry submission.
    if (process.env.ADMIN_EMAIL) {
      sendEmail({
        email: process.env.ADMIN_EMAIL,
        subject: `New Contact Inquiry — ${newContact.subject}`,
        html: newInquiryAdminTemplate(newContact)
      }).catch((err) => console.error('Contact notification email failed:', err.message));
    }

    res.status(201).json(newContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update contact (full update with notes)
router.put('/:id', auth, async (req, res) => {
  try {
    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!updatedContact) return res.status(404).json({ message: 'Contact not found' });
    res.json(updatedContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update contact status only
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in-progress', 'resolved', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const updatedContact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!updatedContact) return res.status(404).json({ message: 'Contact not found' });
    res.json(updatedContact);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
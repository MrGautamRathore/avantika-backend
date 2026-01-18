const mongoose = require('mongoose');
const Contact = require('./models/Contact');
require('dotenv').config();

const seedContacts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels');

    // Delete any existing contacts
    await Contact.deleteMany({});
    console.log('Removed existing contacts');

    // Create sample contacts
    const sampleContacts = [
      {
        name: 'Rajesh Kumar',
        email: 'rajesh.kumar@example.com',
        phone: '+91 9876543210',
        subject: 'Package Booking Inquiry',
        message: 'I am interested in booking the Spiritual Circuit package for next month. Can you provide more details about the itinerary and pricing?'
      },
      {
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        phone: '+91 8765432109',
        subject: 'Custom Tour Request',
        message: 'We are a group of 8 people planning a 5-day trip to Madhya Pradesh. Can you create a custom itinerary covering Ujjain, Indore, and Bhopal?'
      },
      {
        name: 'Amit Patel',
        email: 'amit.patel@example.com',
        subject: 'General Inquiry',
        message: 'I have some questions about the best time to visit Omkareshwar and the accommodation options available.'
      },
      {
        name: 'Sneha Gupta',
        email: 'sneha.gupta@example.com',
        phone: '+91 7654321098',
        subject: 'Feedback',
        message: 'I recently used your services for a trip to Sanchi. The experience was wonderful! Thank you for making our pilgrimage memorable.'
      },
      {
        name: 'Vikram Singh',
        email: 'vikram.singh@example.com',
        subject: 'Package Booking Inquiry',
        message: 'Interested in the Wildlife Safari package. Please send me the detailed brochure and availability for December.'
      }
    ];

    for (const contactData of sampleContacts) {
      const contact = new Contact(contactData);
      await contact.save();
      console.log(`Created contact: ${contactData.name}`);
    }

    console.log('Sample contacts created successfully');

  } catch (error) {
    console.error('Error seeding contacts:', error);
  } finally {
    await mongoose.connection.close();
  }
};

seedContacts();

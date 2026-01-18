const mongoose = require('mongoose');
const Website = require('./models/Website');

const seedWebsite = async () => {
  try {
    // Check if website data already exists
    const existingWebsite = await Website.findOne();
    if (existingWebsite) {
      console.log('Website data already exists');
      return;
    }

    const websiteData = {
      name: "Avantika Travels",
      tagline: "Discover the Divine Beauty of Madhya Pradesh",
      description:
        "Experience the spiritual essence and cultural heritage of Madhya Pradesh with Avantika Travels. We specialize in pilgrimages to Mahakal Mandir and tours across Ujjain, Indore, and Dewas.",
      logo: "/logo.jpg",
      secondaryImage: "/pik2.avif",
      email: "info@avanikatravels.com",
      phone: "+91 8720006707",
      alternatePhone: "+91 8720006707",
      location: "Ujjain, Madhya Pradesh, India",
      address: "123, Mahakal Road, Near Mahakal Mandir, Ujjain, MP - 456001",
      region: "Madhya Pradesh",
      mainAttraction: "Mahakal Mandir",
      socialLinks: {
        facebook: "https://facebook.com/avanikatravels",
        instagram: "https://instagram.com/avanikatravels",
        twitter: "https://twitter.com/avanikatravels",
        youtube: "https://youtube.com/avanikatravels",
      },
      workingHours: "Mon - Sat: 9:00 AM - 7:00 PM",
      theme: {
        primaryColor: "#f03e73",
        secondaryColor: "#ffffff"
      }
    };

    const website = new Website(websiteData);
    await website.save();

    console.log('Website data seeded successfully');
  } catch (error) {
    console.error('Error seeding website data:', error);
  }
};

module.exports = seedWebsite;

// Run if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels')
    .then(() => {
      console.log('Connected to MongoDB');
      return seedWebsite();
    })
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

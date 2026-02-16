const mongoose = require('mongoose');
const Gallery = require('./models/Gallery');

require('dotenv').config();

const galleries = [
  {
    name: "Mahakal Darshan & Bhasma Aarti",
    slug: "mahakal-darshan-bhasma-aarti",
    location: "Ujjain",
    passengerName: "Rahul Sharma",
    story: "Mahakal Lok Corridor ka anubhav adbhut tha. Avantika Travels ki wajah se humein Bhasma Aarti ke liye bahut accha guidance mila.",
    images: [
      { url: "/pik1.avif", public_id: "gallery_1_1" },
      { url: "/pik2.avif", public_id: "gallery_1_2" },
      { url: "/pik3.avif", public_id: "gallery_1_3" },
      { url: "/pik4.avif", public_id: "gallery_1_4" },
      { url: "/pik1.avif", public_id: "gallery_1_5" }
    ],
    status: true
  },
  {
    name: "Narmada River Crossing",
    slug: "narmada-river-crossing",
    location: "Omkareshwar",
    passengerName: "Sneha Patel",
    story: "Omkareshwar mein boat ride aur mandir ke darshan bahut hi shantipurna rahe. Driver bahut humble the.",
    images: [
      { url: "/pik2.avif", public_id: "gallery_2_1" },
      { url: "/pik3.avif", public_id: "gallery_2_2" },
      { url: "/pik4.avif", public_id: "gallery_2_3" },
      { url: "/pik1.avif", public_id: "gallery_2_4" },
      { url: "/pik2.avif", public_id: "gallery_2_5" }
    ],
    status: true
  },
  {
    name: "Indore Night Food Tour",
    slug: "indore-night-food-tour",
    location: "Indore",
    passengerName: "Amit Verma",
    story: "Sarafa Bazaar mein raat ko itni bheed ke bawajood humne Indore ke swadisht khane ka maza liya.",
    images: [
      { url: "/pik3.avif", public_id: "gallery_3_1" },
      { url: "/pik4.avif", public_id: "gallery_3_2" },
      { url: "/pik1.avif", public_id: "gallery_3_3" },
      { url: "/pik2.avif", public_id: "gallery_3_4" },
      { url: "/pik3.avif", public_id: "gallery_3_5" }
    ],
    status: true
  },
  {
    name: "Heritage Walk Maheshwar",
    slug: "heritage-walk-maheshwar",
    location: "Maheshwar",
    passengerName: "Priya Das",
    story: "Ahilya Fort ka nazara aur Narmada ghat ki sundarta dekh kar mann khush ho gaya. Har cheez on-time thi.",
    images: [
      { url: "/pik4.avif", public_id: "gallery_4_1" },
      { url: "/pik1.avif", public_id: "gallery_4_2" },
      { url: "/pik2.avif", public_id: "gallery_4_3" },
      { url: "/pik3.avif", public_id: "gallery_4_4" },
      { url: "/pik4.avif", public_id: "gallery_4_5" }
    ],
    status: true
  },
  {
    name: "Family Group Tour",
    location: "Ujjain",
    passengerName: "Vikram Singh",
    story: "Humne 15 logo ka group tour book kiya tha. Bus ki condition aur hotel stay kaafi badhiya tha.",
    images: [
      { url: "/pik1.avif", public_id: "gallery_5_1" },
      { url: "/pik3.avif", public_id: "gallery_5_2" },
      { url: "/pik2.avif", public_id: "gallery_5_3" },
      { url: "/pik4.avif", public_id: "gallery_5_4" },
      { url: "/pik1.avif", public_id: "gallery_5_5" }
    ],
    status: true
  }
];

async function seedGalleries() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels');

    console.log('Connected to MongoDB');

    // Clear existing galleries
    await Gallery.deleteMany({});
    console.log('Cleared existing galleries');

    // Insert galleries
    const insertedGalleries = await Gallery.insertMany(galleries);
    console.log(`Seeded ${insertedGalleries.length} galleries`);

    console.log('Galleries seeded successfully!');
  } catch (error) {
    console.error('Error seeding galleries:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the seed function
seedGalleries();

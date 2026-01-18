const mongoose = require('mongoose');
const Review = require('./models/Review');
const Package = require('./models/Package');
const Place = require('./models/Place');

require('dotenv').config();

const reviews = [
  {
    userName: "Rajesh Kumar",
    email: "rajesh.kumar@example.com",
    rating: 5,
    comment: "Excellent spiritual journey! The Mahakaleshwar Temple visit was truly divine. The guide was knowledgeable and the arrangements were perfect.",
    status: "approved",
    createdAt: new Date("2024-01-15")
  },
  {
    userName: "Priya Sharma",
    email: "priya.sharma@example.com",
    rating: 4,
    comment: "Great experience in Indore. The street food tour was amazing and the Rajwada Palace was beautiful. Highly recommended!",
    status: "approved",
    createdAt: new Date("2024-02-20")
  },
  {
    userName: "Amit Patel",
    email: "amit.patel@example.com",
    rating: 5,
    comment: "Bhopal is a hidden gem! The lakes are stunning and the history is fascinating. The tour was well organized.",
    status: "approved",
    createdAt: new Date("2024-03-10")
  },
  {
    userName: "Sneha Gupta",
    email: "sneha.gupta@example.com",
    rating: 4,
    comment: "Omkareshwar was peaceful and spiritual. The boat ride to the temple was memorable. Good service overall.",
    status: "approved",
    createdAt: new Date("2024-04-05")
  },
  {
    userName: "Vikram Singh",
    email: "vikram.singh@example.com",
    rating: 3,
    comment: "Sanchi Stupa is impressive but the site was crowded. The guide was helpful though.",
    status: "approved",
    createdAt: new Date("2024-05-12")
  },
  {
    userName: "Meera Joshi",
    email: "meera.joshi@example.com",
    rating: 5,
    comment: "The cultural and food trail was fantastic! Learned so much about local traditions and tasted amazing food.",
    status: "pending",
    createdAt: new Date("2024-06-18")
  },
  {
    userName: "Arun Nair",
    email: "arun.nair@example.com",
    rating: 4,
    comment: "Wildlife safari was thrilling! Saw tigers and beautiful landscapes. The accommodation was comfortable.",
    status: "pending",
    createdAt: new Date("2024-07-22")
  },
  {
    userName: "Kavita Reddy",
    email: "kavita.reddy@example.com",
    rating: 2,
    comment: "The package was overpriced for what was offered. The itinerary was rushed and some places were skipped.",
    status: "rejected",
    createdAt: new Date("2024-08-08")
  },
  {
    userName: "Rohit Verma",
    email: "rohit.verma@example.com",
    rating: 5,
    comment: "Ancient temple architecture tour was eye-opening! The Khajuraho temples are magnificent. Professional guide.",
    status: "approved",
    createdAt: new Date("2024-09-14")
  },
  {
    userName: "Anjali Desai",
    email: "anjali.desai@example.com",
    rating: 4,
    comment: "Weekend getaway to hill stations was refreshing. Pachmarhi is beautiful and the weather was perfect.",
    status: "approved",
    createdAt: new Date("2024-10-25")
  }
];

async function seedReviews() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/avantika-travels');

    console.log('Connected to MongoDB');

    // Clear existing reviews
    await Review.deleteMany({});
    console.log('Cleared existing reviews');

    // Get some packages and places to associate reviews with
    const packages = await Package.find().limit(5);
    const places = await Place.find().limit(5);

    // Assign packageId and placeId to reviews
    reviews.forEach((review, index) => {
      if (index < 5) {
        if (packages[index % packages.length]) {
          review.packageId = packages[index % packages.length]._id;
        }
      } else {
        if (places[(index - 5) % places.length]) {
          review.placeId = places[(index - 5) % places.length]._id;
        }
      }
    });

    // Insert reviews
    const insertedReviews = await Review.insertMany(reviews);
    console.log(`Seeded ${insertedReviews.length} reviews`);

    console.log('Reviews seeded successfully!');
  } catch (error) {
    console.error('Error seeding reviews:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the seed function
seedReviews();

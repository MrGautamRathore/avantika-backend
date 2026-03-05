const express = require('express');
const axios = require('axios');

const router = express.Router();

// WhatsApp API endpoint - send message
router.post('/send', async (req, res) => {
  try {
    const { phoneNumber, message, type, bookingData, paymentData } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ success: false, message: 'Phone number and message are required' });
    }

    // Format phone number - remove any non-digit characters and ensure it has country code
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (!formattedPhone.startsWith('91') && formattedPhone.length === 10) {
      formattedPhone = '91' + formattedPhone;
    }

    // Construct message based on type
    let finalMessage = message;
    if (type === 'payment_success' && bookingData && paymentData) {
      finalMessage = constructPaymentSuccessMessage(bookingData, paymentData);
    }

    // WhatsApp API URL
    const whatsappApiUrl = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    // Request payload for WhatsApp API
    const payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: {
        body: finalMessage
      }
    };

    const response = await axios.post(whatsappApiUrl, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`WhatsApp message sent successfully to ${formattedPhone}`);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('WhatsApp API Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function to construct payment success message
function constructPaymentSuccessMessage(bookingData, paymentData) {
  let message = `*🎉 Booking Confirmed! Thank You!*\n\n`;
  message += `Dear ${bookingData.name},\n\n`;
  message += `Your booking has been confirmed successfully! Here are your details:\n\n`;
  
  // Booking ID
  message += `━━━━━━━━━━━━━━━━━━\n`;
  message += `*📋 Booking ID:* ${bookingData.bookingId}\n`;
  
  // Package Details
  if (bookingData.packageName) {
    message += `*🧳 Package:* ${bookingData.packageName}\n`;
    message += `*📅 Travel Date:* ${new Date(bookingData.travelDate).toLocaleDateString('en-IN')}\n`;
    message += `*👥 Number of People:* ${bookingData.numberOfPeople}\n`;
  }
  
  // Service Details
  if (bookingData.serviceName) {
    message += `*🛎️ Service:* ${bookingData.serviceName}\n`;
  }
  
  // Payment Details
  message += `\n━━━━━━━━━━━━━━━━━━\n`;
  message += `*💳 Payment Details*\n`;
  message += `*✅ Amount Paid:* ₹${paymentData.amountPaid.toLocaleString('en-IN')}\n`;
  message += `*🆔 Payment ID:* ${paymentData.paymentId}\n`;
  message += `*📆 Payment Date:* ${new Date(paymentData.paymentDate).toLocaleDateString('en-IN')}\n`;
  
  if (bookingData.balancePayment && bookingData.balancePayment > 0) {
    message += `*💰 Balance to Pay:* ₹${bookingData.balancePayment.toLocaleString('en-IN')}\n`;
  }
  
  message += `\n━━━━━━━━━━━━━━━━━━\n`;
  message += `*📞 Contact Us*\n`;
  message += `For any queries, please contact us.\n\n`;
  message += `Thank you for choosing Avantika Travels!\n`;
  message += `*Have a great journey! 🏃‍♂️💨*`;

  return message;
}

module.exports = router;

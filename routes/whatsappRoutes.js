// routes/aisensyRoutes.js
const express = require("express");
const axios = require("axios");

const router = express.Router();

// WhatsApp API endpoint - send message with templates (AiSensy Integration)
router.post("/send", async (req, res) => {
  try {
    const { phoneNumber, userName, packageName, packageDuration, type, bookingData, paymentData } = req.body;
   /*  console.log("📥 Received WhatsApp request:", 
      req.body
    ); */

    // Validation
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // Format phone number (remove + and special chars)
    let formattedPhone = phoneNumber.replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = formattedPhone.substring(1);
    }
    if (formattedPhone.length === 10) {
      formattedPhone = "91" + formattedPhone;
    }

    //console.log("📱 Formatted phone:", formattedPhone);

    // Get API key
    const apiKey =
      process.env.AISENSY_API_KEY || process.env.AISENSY_PROJECT_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "API key not configured. Please set AISENSY_API_KEY in .env",
      });
    }

    // Prepare templateParams as ARRAY (not object)
    let templateParamsArray = [];
    let campaignName = "avantika_booking_initiated"; // Your campaign name

    // Build templateParams array based on type
    if (type === "payment_success" && bookingData && paymentData) {
      templateParamsArray = [
        bookingData.name || "Customer", // {{1}} name
        bookingData.packageName || "", // {{3}} package_name
        bookingData.packageName || "", // {{3}} package_name
        bookingData.travelDate
          ? new Date(bookingData.travelDate).toLocaleDateString("en-IN")
          : "", // {{4}} travel_date
        paymentData.totalAmount || "N/A", // {{6}} payment_id
        paymentData.amountPaid?.toString() || "0", // {{5}} amount_paid
      ];
    } else if (type === "booking_confirmation" && bookingData) {
      templateParamsArray = [
        bookingData.name || "Customer", // {{1}} name
        bookingData.packageName || "", // {{3}} package_name
        bookingData.packageName || "", // {{3}} package_name
        bookingData.travelDate
          ? new Date(bookingData.travelDate).toLocaleDateString("en-IN")
          : "", // {{4}} travel_date
        paymentData?.totalAmount || "N/A", // {{6}} payment_id
        paymentData?.amountPaid?.toString() || "0", // {{5}} amount_paid
      ];
    } else {
      // Safe bookingData access - FIXED null/undefined crash for travelDate
      const safeBookingData = bookingData || {};
      const travelDate = safeBookingData.travelDate 
        ? new Date(safeBookingData.travelDate).toLocaleDateString("en-IN") 
        : "TBD";

      templateParamsArray = [
        String(userName || "Customer"),
        String(packageName || "Package"),
        String(packageName || "Package"),
        travelDate,
        String(safeBookingData.totalPrice || "0"),
        String(safeBookingData.advancePayment || "0")
      ];
    }

    console.log("📱 Formatted template params:", templateParamsArray);

    // Create payload in EXACT format from their test URL
    const payload = {
      apiKey: apiKey,
      campaignName: campaignName,
      destination: formattedPhone ,
      userName: "Avantika travels",
      templateParams: templateParamsArray, // This MUST be an array
      source: "new-landing-page form",
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
      attributes: {},
      paramsFallbackValue: {},
    };

  //  console.log("📤 Sending payload:", JSON.stringify(payload, null, 2));
   // console.log(`📋 Template Params Array:`, templateParamsArray);

    // Send message via AiSensy API
    const apiResponse = await axios.post(
      "https://backend.aisensy.com/campaign/t1/api/v2",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    //console.log(`✅ AiSensy template message sent to 919302088025`);
    //console.log(`📊 Response:`, apiResponse.data);

    res.json({
      success: true,
      data: apiResponse.data,
      phoneSentTo: formattedPhone,
      messageType: type || "custom",
      templateUsed: campaignName,
      paramsSent: templateParamsArray.length,
    });
  } catch (error) {
    console.error("❌ AiSensy Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      requestPayload: error.config?.data,
    });

    let errorMessage = error.response?.data?.message || error.message;
    let statusCode = error.response?.status || 500;

    if (error.response?.status === 401) {
      errorMessage =
        "Invalid API key. Please check your AiSensy API key in .env file";
    } else if (error.response?.status === 404) {
      errorMessage = `Campaign '${campaignName}' not found. Please create this campaign in AiSensy dashboard first`;
    } else if (error.response?.status === 400) {
      errorMessage =
        "Invalid template parameters. Check that all required variables are provided as an array";
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      details: error.response?.data,
      code: error.code || "UNKNOWN_ERROR",
    });
  }
});


module.exports = router;

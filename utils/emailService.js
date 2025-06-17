// backend_template/utils/emailService.js
const emailjs = require('@emailjs/nodejs');

const sendEmail = async ({ to_email, to_name, message }) => {
  try {
    const result = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      {
        email: to_email,
        name: to_name,
        message: message,
      },
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY, // optional if required
      }
    );
    console.log('Email sent:', result.status);
  } catch (error) {
    console.error('Email failed:', error);
  }
};

module.exports = { sendEmail };

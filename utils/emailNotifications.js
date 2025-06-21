
/**
 * Simulates sending an email to the admin when a new user pre-registers via their link.
 * @param {string} adminEmail The admin's email.
 * @param {string} adminName The admin's name.
 * @param {string} pendingUserName The display name of the user who pre-registered.
 * @param {string} pendingUserUniqueId The unique ID chosen by the pending user.
 * @param {string} organizationId The organization ID.
 */
const sendPreRegistrationNotificationToAdminEmail = async (adminEmail, adminName, pendingUserName, pendingUserUniqueId, organizationId) => {
  const subject = "New User Pre-registration Submitted";
  const body = `
    Hello ${adminName},

    A new user, ${pendingUserName} (Desired System ID: ${pendingUserUniqueId}), has submitted a pre-registration request 
    for your organization (ID: ${organizationId}) using one of your referral links.
    
    Please log in to the Task Assignment Assistant to review and approve their request in the "User Management" section.

    Regards,
    Task Assignment System
  `;
  // In a real application, you would use an email sending library (Nodemailer, SendGrid, etc.)
  console.log(`--- SIMULATING BACKEND EMAIL ---
To: ${adminEmail}
Subject: ${subject}
Body:
${body.trim().replace(/^    /gm, '')}
--- END SIMULATING BACKEND EMAIL ---`);
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 50)); 
};

module.exports = {
  sendPreRegistrationNotificationToAdminEmail,
};

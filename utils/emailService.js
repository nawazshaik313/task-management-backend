
let emailjsInstance = null;
let isEmailJsSdkInitialized = false;
let emailJsInitializationError = null;

try {
  emailjsInstance = require('@emailjs/nodejs');
  if (!emailjsInstance || typeof emailjsInstance.init !== 'function') {
    emailJsInitializationError = "@emailjs/nodejs module did not load correctly or is not as expected. Email sending will be disabled.";
    console.error("EmailJS SDK Init Error: " + emailJsInitializationError);
    emailjsInstance = null; 
  }
} catch (e) {
  emailJsInitializationError = "Failed to require('@emailjs/nodejs'). Package might be missing, corrupted, or not installed. Emails will be disabled.";
  console.error("EmailJS SDK Require Error: " + emailJsInitializationError, e);
  emailjsInstance = null;
}

if (emailjsInstance) {
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

  if (EMAILJS_PUBLIC_KEY && EMAILJS_PRIVATE_KEY) {
    try {
      emailjsInstance.init({
        publicKey: EMAILJS_PUBLIC_KEY,
        privateKey: EMAILJS_PRIVATE_KEY,
      });
      isEmailJsSdkInitialized = true;
      console.log("EmailJS SDK initialized successfully.");
    } catch (initError) {
      emailJsInitializationError = "EmailJS SDK .init() call failed.";
      console.error("EmailJS SDK Init Error: " + emailJsInitializationError, initError);
      isEmailJsSdkInitialized = false; 
    }
  } else {
    emailJsInitializationError = "EmailJS Public or Private Key not found in .env. Email sending will be disabled.";
    console.warn("EmailJS SDK Config Warn: " + emailJsInitializationError);
    isEmailJsSdkInitialized = false; 
  }
}


const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;

const isEmailServiceConfiguredAndReady = () => {
  if (!EMAILJS_SERVICE_ID) {
    if (!emailJsInitializationError) emailJsInitializationError = "EMAILJS_SERVICE_ID is not set in .env.";
    return false;
  }
  if (!emailjsInstance) {
     if (!emailJsInitializationError) emailJsInitializationError = "emailjsInstance is null (require failed).";
    return false;
  }
  if (!isEmailJsSdkInitialized) {
    // emailJsInitializationError should already be set
    return false;
  }
  return true;
};

const sendEmailInternal = async (templateId, templateParams) => {
  if (!isEmailServiceConfiguredAndReady()) {
    const reason = emailJsInitializationError || "EmailJS Service ID or SDK not ready.";
    console.warn(`Email Service (EmailJS) not ready. Reason: ${reason}. Skipping email send. Template: ${templateId}, Params (first 200 chars):`, JSON.stringify(templateParams).substring(0,200));
    return Promise.resolve({ status: 'simulated_success', text: `EmailJS not ready: ${reason}` });
  }
  
  if (!templateId) {
    console.error("EmailJS Error: Template ID is missing for sendEmailInternal. Cannot send email.");
    return Promise.reject(new Error("EmailJS Template ID is missing."));
  }

  try {
    const response = await emailjsInstance.send(EMAILJS_SERVICE_ID, templateId, templateParams);
    console.log(`EmailJS: Email sent successfully using template ${templateId}! Response status: ${response.status}, text: ${response.text}`);
    return response;
  } catch (error) {
    console.error(`EmailJS: Failed to send email using template ${templateId}. Error Code: ${error.code || 'N/A'}, Status: ${error.status || 'N/A'}, Text: ${error.text || error.message || 'No details'}`, error);
    // Rethrow to allow specific handling by caller if needed, or just log here.
    // For now, let's return a consistent error structure if possible.
    throw new Error(`EmailJS send failed for template ${templateId}: ${error.text || error.message || 'Unknown EmailJS error'}`);
  }
};


exports.sendWelcomeRegistrationEmail = async (email, displayName, role, companyName = '') => {
  const templateParams = {
    to_email: email,
    to_name: displayName,
    user_role: role,
    company_name: companyName,
    login_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#LOGIN`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_WELCOME, templateParams);
};

exports.sendPasswordResetEmail = async (email, displayName, resetLink) => {
  const templateParams = {
    to_email: email,
    to_name: displayName,
    reset_link: resetLink,
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_PASSWORD_RESET, templateParams);
};

exports.sendAccountActivatedByAdminEmail = async (userEmail, userName, adminName) => {
  const templateParams = {
    to_email: userEmail,
    to_name: userName,
    admin_name: adminName,
    login_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#LOGIN`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_ACCOUNT_ACTIVATED, templateParams);
};

exports.sendTaskProposalEmail = async (userEmail, userName, taskTitle, adminName, deadline) => {
  const templateParams = {
    to_email: userEmail,
    to_name: userName,
    task_title: taskTitle,
    admin_name: adminName,
    task_deadline: deadline ? new Date(deadline).toLocaleDateString() : 'Not set',
    assignments_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#VIEW_ASSIGNMENTS`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_TASK_PROPOSED, templateParams);
};

exports.sendTaskStatusUpdateToAdminEmail = async (adminEmail, adminName, userName, taskTitle, userAction) => {
  const templateParams = {
    to_email: adminEmail,
    admin_name: adminName,
    user_name: userName,
    task_title: taskTitle,
    user_action: userAction,
    dashboard_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#DASHBOARD`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_TASK_UPDATE_ADMIN, templateParams);
};

exports.sendTaskCompletionApprovedToUserEmail = async (userEmail, userName, taskTitle, adminName) => {
  const templateParams = {
    to_email: userEmail,
    to_name: userName,
    task_title: taskTitle,
    admin_name: adminName,
    assignments_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#VIEW_ASSIGNMENTS`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_TASK_COMPLETED_USER, templateParams);
};

exports.sendPreRegistrationSubmittedToUserEmail = async (email, displayName, adminDisplayName) => {
  const templateParams = {
    to_email: email,
    to_name: displayName,
    admin_name: adminDisplayName,
    login_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#LOGIN`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_PREREG_SUBMITTED_USER, templateParams);
};

exports.sendPreRegistrationNotificationToAdminEmail = async (adminEmail, adminName, pendingUserName, pendingUserUniqueId) => {
  const templateParams = {
    to_email: adminEmail,
    admin_name: adminName,
    pending_user_name: pendingUserName,
    pending_user_unique_id: pendingUserUniqueId,
    user_management_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#USER_MANAGEMENT`
  };
  return sendEmailInternal(process.env.EMAILJS_TEMPLATE_PREREG_NOTIFY_ADMIN, templateParams);
};

exports.sendRegistrationPendingToUserEmail = async (email, displayName) => {
    const templateParams = {
        to_email: email,
        to_name: displayName,
        login_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#LOGIN`
    };
    return sendEmailInternal(process.env.EMAILJS_TEMPLATE_REG_PENDING_USER, templateParams);
};

exports.sendNewPendingRegistrationToAdminEmail = async (adminEmail, adminName, newUserName, newUserEmail, organizationId) => {
    const templateParams = {
        to_email: adminEmail,
        admin_name: adminName,
        new_user_name: newUserName,
        new_user_email: newUserEmail,
        user_management_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}#USER_MANAGEMENT`
    };
    return sendEmailInternal(process.env.EMAILJS_TEMPLATE_REG_PENDING_ADMIN, templateParams);
};

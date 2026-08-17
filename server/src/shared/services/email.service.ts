import { BrevoClient, Brevo } from '@getbrevo/brevo';

const getBrevoClient = () => {
    if (!process.env.BREVO_API_KEY) {
        throw new Error('[EMAIL] BREVO_API_KEY is not set in environment variables');
    }
    return new BrevoClient({
        apiKey: process.env.BREVO_API_KEY,
    });
};

export const sendOtpEmail = async (to: string, otp: string) => {
    try {
        console.log(`[EMAIL] Sending OTP to: ${to}`);

        const brevo = getBrevoClient();

        const result = await brevo.transactionalEmails.sendTransacEmail({
            subject: 'Password Reset Verification Code - FlowDesk',
            htmlContent: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #6366f1;">Password Reset Request</h2>
                    <p>Hello,</p>
                    <p>We received a request to reset the password for your FlowDesk account associated with this email address.</p>
                    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${otp}</span>
                    </div>
                    <p>This code expires in 15 minutes.</p>
                    <p>If you did not request this, you can safely ignore this email.</p>
                    <br />
                    <p>Best regards,<br/>The FlowDesk Team</p>
                </div>
            `,
            sender: { 
                name: 'FlowDesk Support', 
                email: process.env.BREVO_SENDER_EMAIL || 'support.aceone@gmail.com' 
            },
            to: [{ email: to }]
        });

        console.log(`[EMAIL] ✅ OTP sent successfully. ID: ${result.messageId}`);
    } catch (error) {
        console.error(`[EMAIL] ❌ Failed to send OTP to ${to}:`, error);
        throw error;
    }
};

export const sendRegistrationOtpEmail = async (to: string, otp: string, companyName: string) => {
    try {
        console.log(`[EMAIL] Sending registration OTP to: ${to}`);

        const brevo = getBrevoClient();

        const result = await brevo.transactionalEmails.sendTransacEmail({
            subject: `Welcome to FlowDesk! - Please verify your email address to complete registration for ${companyName}`,
            htmlContent: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to FlowDesk!</h1>
                    </div>
                    <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="font-size: 16px; margin: 0 0 16px 0;">Hello,</p>
                        <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">
                            You're one step away from setting up <strong>${companyName}</strong> on FlowDesk. 
                            Please use the verification code below to confirm your email address.
                        </p>
                        <div style="background-color: #f3f4f6; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0;">
                            <span style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #1f2937;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #6b7280;">This code expires in 15 minutes.</p>
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                        <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                            If you did not request this, you can safely ignore this email.
                        </p>
                        <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                            Best regards,<br/>The FlowDesk Team
                        </p>
                    </div>
                </div>
            `,
            sender: {
                name: 'FlowDesk Team',
                email: process.env.BREVO_SENDER_EMAIL || 'support.aceone@gmail.com'
            },
            to: [{ email: to }]
        });

        console.log(`[EMAIL] ✅ Registration OTP sent successfully. ID: ${result.messageId}`);
    } catch (error) {
        console.error(`[EMAIL] ❌ Failed to send registration OTP to ${to}:`, error);
        throw error;
    }
};

export const sendBackupEmail = async (to: string, subject: string, fileBuffer: Buffer, filename: string): Promise<void> => {
  try {
    console.log(`[EMAIL] Sending backup email to: ${to}`);
    const brevo = getBrevoClient();
    const base64Content = fileBuffer.toString('base64');

    await brevo.transactionalEmails.sendTransacEmail({
      subject,
      htmlContent: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">FlowDesk Backup</h1>
          </div>
          <div style="padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #4b5563;">Your scheduled FlowDesk backup is attached.</p>
            <p style="font-size: 14px; color: #6b7280;">File: <strong>${filename}</strong></p>
            <p style="font-size: 14px; color: #6b7280;">Generated: ${new Date().toLocaleString()}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 14px; color: #9ca3af; text-align: center;">Sent via FlowDesk Backup System</p>
          </div>
        </div>
      `,
      sender: {
        name: 'FlowDesk Backup',
        email: process.env.BREVO_SENDER_EMAIL || 'support.aceone@gmail.com'
      },
      to: [{ email: to }],
      attachment: [{ content: base64Content, name: filename }],
    });

    console.log(`[EMAIL] Backup sent to ${to}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send backup email:', error);
    throw error;
  }
};

export const sendGenericEmail = async (to: string[], subject: string, message: string): Promise<Brevo.SendTransacEmailResponse> => {
    try {
        console.log(`[EMAIL] Sending bulk email to ${to.length} recipients`);

        const brevo = getBrevoClient();

        const result = await brevo.transactionalEmails.sendTransacEmail({
            subject: subject,
            htmlContent: `
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
                    <div style="background-color: #6366f1; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">FlowDesk Notification</h1>
                    </div>
                    <div style="padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                        <div style="white-space: pre-wrap; font-size: 16px; color: #4b5563;">${message}</div>
                        <br />
                        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                        <p style="font-size: 14px; color: #9ca3af; text-align: center;">
                            Sent via FlowDesk Business Platform
                        </p>
                    </div>
                </div>
            `,
            sender: { 
                name: 'FlowDesk Team', 
                email: process.env.BREVO_SENDER_EMAIL || 'support.aceone@gmail.com' 
            },
            to: to.map(email => ({ email }))
        });

        console.log(`[EMAIL] ✅ Bulk email sent. ID: ${result.messageId}`);
        return result;
    } catch (error) {
        console.error('[EMAIL] ❌ Failed to send bulk email:', error);
        throw new Error('Failed to send bulk email');
    }
};

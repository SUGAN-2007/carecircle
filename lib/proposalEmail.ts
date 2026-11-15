import { escapeHtml } from './emailTemplates';

export interface PendingProposalEmailParams {
  elderName: string;
  type: string;
  description: string;
  proposedBy: string;
}

export function buildPendingProposalEmail(params: PendingProposalEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const safeName = escapeHtml(params.elderName);
  const safeDesc = escapeHtml(params.description);
  const safeProposer = escapeHtml(params.proposedBy);

  const subject = `Action Required: New healthcare proposal from your caretaker`;

  const bodyHtml = `
    <p>Hello ${safeName},</p>
    <p>Your caretaker (${safeProposer}) has proposed a change to your healthcare schedule:</p>
    <div style="background-color: #f1f5f9; border-left: 6px solid #2563eb; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 20px; font-weight: bold;">
      ${safeDesc}
    </div>
    <p><strong>This change will not take effect until you approve it.</strong></p>
    <p>Please log in to your CareCircle dashboard and review this request on your <strong>Approvals</strong> screen.</p>
  `;

  const text = `Hello ${params.elderName},

Your caretaker (${params.proposedBy}) has proposed a change to your healthcare schedule:

${params.description}

This change will not take effect until you approve it.
Please log in to your CareCircle dashboard to approve or reject this request.`;

  return {
    subject,
    html: `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.6; color: #1e293b; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; border: 2px solid #cbd5e1; border-radius: 16px; padding: 32px;">
        <h1 style="color: #1d4ed8; font-size: 24px;">💊 CareCircle Approval Request</h1>
        ${bodyHtml}
      </div>
    </body></html>`,
    text,
  };
}

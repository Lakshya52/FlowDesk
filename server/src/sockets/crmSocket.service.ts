import { io } from '../index';

export const emitLeadCreated = (tenantId: string, lead: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:created", lead);
};

export const emitLeadUpdated = (tenantId: string, lead: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:updated", lead);
};

export const emitLeadDeleted = (tenantId: string, leadId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:deleted", leadId);
};

export const emitCampaignCreated = (tenantId: string, campaign: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:campaign:created", campaign);
};

export const emitCampaignUpdated = (tenantId: string, campaign: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:campaign:updated", campaign);
};

export const emitCampaignDeleted = (tenantId: string, campaignId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:campaign:deleted", campaignId);
};

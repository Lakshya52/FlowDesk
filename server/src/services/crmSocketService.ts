import { io } from "../index";

export const emitLeadCreated = (tenantId: string, lead: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:created", lead);
};

export const emitLeadUpdated = (tenantId: string, lead: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:updated", lead);
};

export const emitLeadDeleted = (tenantId: string, leadId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:lead:deleted", leadId);
};

export const emitDatabaseCreated = (tenantId: string, database: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:database:created", database);
};

export const emitDatabaseUpdated = (tenantId: string, database: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:database:updated", database);
};

export const emitDatabaseDeleted = (tenantId: string, databaseId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:database:deleted", databaseId);
};

export const emitPartnerCreated = (tenantId: string, partner: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:partner:created", partner);
};

export const emitPartnerUpdated = (tenantId: string, partner: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:partner:updated", partner);
};

export const emitPartnerDeleted = (tenantId: string, partnerId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:partner:deleted", partnerId);
};

export const emitCaseFileCreated = (tenantId: string, caseFile: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:case-file:created", caseFile);
};

export const emitCaseFileUpdated = (tenantId: string, caseFile: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:case-file:updated", caseFile);
};

export const emitCaseFileDeleted = (tenantId: string, caseFileId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:case-file:deleted", caseFileId);
};

export const emitLoanProductCreated = (tenantId: string, product: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:loan-product:created", product);
};

export const emitLoanProductUpdated = (tenantId: string, product: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:loan-product:updated", product);
};

export const emitLoanProductDeleted = (tenantId: string, productId: string) => {
  io.to(`tenant_${tenantId}`).emit("crm:loan-product:deleted", productId);
};

export const emitDocStatusChanged = (tenantId: string, docStatus?: any) => {
  io.to(`tenant_${tenantId}`).emit("crm:doc-status:changed", docStatus ?? {});
};

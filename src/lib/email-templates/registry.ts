import type { ComponentType } from "react";
import { template as leaveApproved } from "./leave-approved";
import { template as leaveRejected } from "./leave-rejected";
import { template as leaveCancelled } from "./leave-cancelled";
import { template as permissionApproved } from "./permission-approved";
import { template as permissionRejected } from "./permission-rejected";
import { template as permissionCancelled } from "./permission-cancelled";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  to?: string;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  "leave-approved": leaveApproved,
  "leave-rejected": leaveRejected,
  "leave-cancelled": leaveCancelled,
  "permission-approved": permissionApproved,
  "permission-rejected": permissionRejected,
  "permission-cancelled": permissionCancelled,
};

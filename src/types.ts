export type FactoryName = 'Bulugolla' | 'Kurunegala' | 'Werapola';

export type UserRole = 'operator' | 'supervisor' | 'manager' | 'admin' | 'viewer';

export type UserStatus = 'active' | 'pending' | 'suspended';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  factory: FactoryName | 'ALL';
  createdAt: string;
  status?: UserStatus;
  email?: string;
  picture?: string;
  pendingPasswordReset?: {
    requestedPassword?: string;
    requestedAt: string;
    factory?: string;
    reason?: string;
  };
  pendingRoleChange?: {
    requestedRole: UserRole;
    requestedAt: string;
    reason?: string;
  };
}

export interface DowntimeRecord {
  code: string;
  description: string;
  minutes: number;
}

export interface StyleEntry {
  id: string;
  styleNumber: string;
  product: string;
  brand: string;
  smv: number;
  shiftHours: number;
  plannedQty: number;
  actualQty: number;
  downTimeMins?: number;
  dtCode?: string;
  remarks?: string;
  hoursAdjustment?: number; // Adjustment in hours (can be + or -)
  hoursAdjustmentReason?: string; // Optional description/reason for adjustment
}

export interface ProductionLog {
  // 1. Unique ID
  Entry_ID: string;
  // 2. Automated timestamp
  Timestamp: string;
  // 3. Shift Date
  Date: string;
  // 4. Plant
  Factory: FactoryName;
  // 5. Line number
  Line: string;
  // 6. Automatic Factory first letter + Line
  Line_No: string;
  // 7. Supervisor
  Supervisor: string;
  // 8. Style number
  Style: string;
  // 9. Product category
  Product: string;
  // 10. Brand
  Brand: string;
  // 11. Standard Minute Value
  SMV: number;
  // 12. Target
  Planned_QTY: number;
  // 13. Output
  Actual_QTY: number;
  // 14. Produced Minutes (Actual_QTY * SMV)
  Produced_Minutes: number;
  // 15. Team members planned
  Plan_TMs: number;
  // 16. Team members allocated
  Actual_TMs: number;
  // 17. Team members present
  Present_TMs: number;
  // 18. Hours Worked (Proportional split if multiple styles)
  Hours_Worked: number;
  // 19. Worked Minutes (Present_TMs * Hours_Worked * 60)
  Worked_Minutes: number;
  // 20. Total downtime minutes
  Down_Time: number;
  // 21. Operator remarks
  Remarks: string;
  // 22. Submitter username
  User: string;
  // 23. Hours Adjustment (+ or - hours)
  Hours_Adjustment?: number;
  // 24. Description / Reason for Hours Adjustment
  Hours_Adjustment_Reason?: string;
}

export interface FilterState {
  startDate: string;
  endDate: string;
  factory: string;
  line: string;
  product: string;
}

export interface DowntimeCategoryLog {
  id: string;
  entryId?: string; // Foreign Key connecting to ProductionLog.Entry_ID
  date: string;
  factory: FactoryName;
  line: string;
  supervisor: string;
  product: string;
  brand: string;
  style: string;
  downtimeMinutes: number;
  downtimeCategory: string; // e.g. "EN1 - Machine Breakdown"
  categoryCode?: string;   // e.g. "EN1"
  remarks: string;
  user: string;
  createdAt?: string;
}

export type ChangeRequestType = 'DELETE' | 'EDIT';
export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DataChangeRequest {
  id: string;
  type: ChangeRequestType;
  entryId: string;
  logSnapshot: ProductionLog;
  proposedChanges?: Partial<ProductionLog>;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: ChangeRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

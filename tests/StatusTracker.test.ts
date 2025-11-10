// status-tracker.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INVALID_STATUS = 301;
const ERR_TICKET_NOT_FOUND = 302;
const ERR_HISTORY_FULL = 303;
const ERR_INVALID_ROLE = 304;
const ERR_STATUS_NOT_UPDATED = 305;
const ERR_MAX_HISTORY_EXCEEDED = 306;

interface StatusEntry {
  status: string;
  updatedAt: number;
  updater: string;
  role: string;
}

interface TicketRoles {
  user: string;
  agent?: string;
  admin?: string;
}

interface CurrentStatus {
  status: string;
  lastUpdated: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class StatusTrackerMock {
  state: {
    maxHistoryEntries: number;
    adminPrincipal: string;
    statusHistory: Map<number, StatusEntry[]>;
    ticketRoles: Map<number, TicketRoles>;
    currentStatus: Map<number, CurrentStatus>;
  } = {
    maxHistoryEntries: 10,
    adminPrincipal: "ST1ADMIN",
    statusHistory: new Map(),
    ticketRoles: new Map(),
    currentStatus: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      maxHistoryEntries: 10,
      adminPrincipal: "ST1ADMIN",
      statusHistory: new Map(),
      ticketRoles: new Map(),
      currentStatus: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
  }

  initializeTicketRoles(ticketId: number, agent?: string, admin?: string): Result<boolean> {
    if (this.state.ticketRoles.has(ticketId)) {
      return { ok: false, value: ERR_TICKET_NOT_FOUND };
    }
    this.state.ticketRoles.set(ticketId, {
      user: this.caller,
      agent,
      admin,
    });
    this.state.currentStatus.set(ticketId, { status: "open", lastUpdated: this.blockHeight });
    return { ok: true, value: true };
  }

  updateStatus(ticketId: number, newStatus: string, role: string): Result<boolean> {
    if (!["open", "in-progress", "escalated", "resolved", "closed"].includes(newStatus)) {
      return { ok: false, value: ERR_INVALID_STATUS };
    }
    const roles = this.state.ticketRoles.get(ticketId);
    if (!roles) return { ok: false, value: ERR_TICKET_NOT_FOUND };
    if (role === "user" || (role === "agent" && roles.agent === this.caller) || (role === "admin" && roles.admin === this.caller) || this.caller === roles.user) {
      let history = this.state.statusHistory.get(ticketId) || [];
      const newEntry: StatusEntry = { status: newStatus, updatedAt: this.blockHeight, updater: this.caller, role };
      history.push(newEntry);
      if (history.length > this.state.maxHistoryEntries) {
        history = history.slice(-this.state.maxHistoryEntries);
      }
      this.state.statusHistory.set(ticketId, history);
      this.state.currentStatus.set(ticketId, { status: newStatus, lastUpdated: this.blockHeight });
      return { ok: true, value: true };
    }
    return { ok: false, value: ERR_INVALID_ROLE };
  }

  revertStatus(ticketId: number, targetHeight: number): Result<boolean> {
    const history = this.state.statusHistory.get(ticketId);
    const roles = this.state.ticketRoles.get(ticketId);
    if (!history || !roles || (roles.admin !== this.caller && this.caller !== this.state.adminPrincipal)) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (targetHeight >= history.length) {
      return { ok: false, value: ERR_STATUS_NOT_UPDATED };
    }
    const targetEntry = history[history.length - 1 - targetHeight];
    this.state.currentStatus.set(ticketId, { status: targetEntry.status, lastUpdated: targetEntry.updatedAt });
    return { ok: true, value: true };
  }

  setMaxHistory(newMax: number): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (newMax <= 0 || newMax > 50) {
      return { ok: false, value: ERR_INVALID_STATUS };
    }
    this.state.maxHistoryEntries = newMax;
    return { ok: true, value: true };
  }

  getCurrentStatus(ticketId: number): CurrentStatus | null {
    return this.state.currentStatus.get(ticketId) || null;
  }

  getStatusHistory(ticketId: number): StatusEntry[] {
    return this.state.statusHistory.get(ticketId) || [];
  }

  getRoles(ticketId: number): TicketRoles | null {
    return this.state.ticketRoles.get(ticketId) || null;
  }

  assignAgent(ticketId: number, newAgent: string): Result<boolean> {
    const roles = this.state.ticketRoles.get(ticketId);
    if (!roles || this.caller !== roles.user) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.ticketRoles.set(ticketId, { ...roles, agent: newAgent });
    return { ok: true, value: true };
  }

  assignAdmin(ticketId: number, newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    const roles = this.state.ticketRoles.get(ticketId);
    if (!roles) return { ok: false, value: ERR_TICKET_NOT_FOUND };
    this.state.ticketRoles.set(ticketId, { ...roles, admin: newAdmin });
    return { ok: true, value: true };
  }

  getAdmin(): Result<string> {
    return { ok: true, value: this.state.adminPrincipal };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.adminPrincipal = newAdmin;
    return { ok: true, value: true };
  }
}

describe("StatusTracker", () => {
  let contract: StatusTrackerMock;

  beforeEach(() => {
    contract = new StatusTrackerMock();
    contract.reset();
  });

  it("initializes ticket roles successfully", () => {
    const result = contract.initializeTicketRoles(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const roles = contract.getRoles(1);
    expect(roles?.user).toBe("ST1USER");
    expect(roles?.agent).toBeUndefined();
    expect(roles?.admin).toBeUndefined();
    const status = contract.getCurrentStatus(1);
    expect(status?.status).toBe("open");
  });

  it("updates status as user", () => {
    contract.initializeTicketRoles(1);
    const result = contract.updateStatus(1, "in-progress", "user");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const history = contract.getStatusHistory(1);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("in-progress");
    expect(history[0].updater).toBe("ST1USER");
    const current = contract.getCurrentStatus(1);
    expect(current?.status).toBe("in-progress");
  });

  it("rejects invalid status update", () => {
    contract.initializeTicketRoles(1);
    const result = contract.updateStatus(1, "invalid", "user");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("reverts status as admin", () => {
    contract.initializeTicketRoles(1, undefined, "ST1ADMIN");
    contract.updateStatus(1, "in-progress", "user");
    contract.updateStatus(1, "resolved", "user");
    contract.caller = "ST1ADMIN";
    const result = contract.revertStatus(1, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const current = contract.getCurrentStatus(1);
    expect(current?.status).toBe("in-progress");
  });

  it("rejects revert by non-admin", () => {
    contract.initializeTicketRoles(1);
    contract.updateStatus(1, "in-progress", "user");
    const result = contract.revertStatus(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets max history as admin", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setMaxHistory(5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxHistoryEntries).toBe(5);
  });

  it("rejects setting max history by non-admin", () => {
    const result = contract.setMaxHistory(5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("assigns agent as user", () => {
    contract.initializeTicketRoles(1);
    const result = contract.assignAgent(1, "ST1AGENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const roles = contract.getRoles(1);
    expect(roles?.agent).toBe("ST1AGENT");
  });

  it("rejects agent assignment by non-user", () => {
    contract.initializeTicketRoles(1);
    contract.caller = "ST2FAKE";
    const result = contract.assignAgent(1, "ST1AGENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("assigns admin as current admin", () => {
    contract.initializeTicketRoles(1);
    contract.caller = "ST1ADMIN";
    const result = contract.assignAdmin(1, "ST2ADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const roles = contract.getRoles(1);
    expect(roles?.admin).toBe("ST2ADMIN");
  });

  it("rejects admin assignment by non-admin", () => {
    contract.initializeTicketRoles(1);
    const result = contract.assignAdmin(1, "ST2ADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets new admin as current admin", () => {
    contract.caller = "ST1ADMIN";
    const result = contract.setAdmin("ST2ADMIN");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.adminPrincipal).toBe("ST2ADMIN");
  });

  it("rejects setting admin by non-admin", () => {
    const result = contract.setAdmin("ST2ADMIN");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets admin correctly", () => {
    const result = contract.getAdmin();
    expect(result.ok).toBe(true);
    expect(result.value).toBe("ST1ADMIN");
  });

  it("trims history when full", () => {
    contract.state.maxHistoryEntries = 1;
    contract.initializeTicketRoles(1);
    contract.updateStatus(1, "in-progress", "user");
    contract.updateStatus(1, "resolved", "user");
    const history = contract.getStatusHistory(1);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("resolved");
  });

  it("parses status with Clarity types", () => {
    const status = stringAsciiCV("open");
    const ticketId = uintCV(1);
    expect(status.value).toBe("open");
    expect(ticketId.value).toEqual(BigInt(1));
  });

  it("rejects update for non-existent ticket", () => {
    const result = contract.updateStatus(999, "in-progress", "user");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TICKET_NOT_FOUND);
  });

  it("rejects role validation for unauthorized agent", () => {
    contract.initializeTicketRoles(1, "ST1AGENT");
    contract.caller = "ST2FAKE";
    const result = contract.updateStatus(1, "in-progress", "agent");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });
});
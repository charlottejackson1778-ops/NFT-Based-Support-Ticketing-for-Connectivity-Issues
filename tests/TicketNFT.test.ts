import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, someCV, principalCV, listCV, tupleCV } from "@stacks/transactions";

const ERR_UNAUTHORIZED = 100;
const ERR_NOT_FOUND = 101;
const ERR_INVALID_DESCRIPTION = 102;
const ERR_INVALID_PRIORITY = 103;
const ERR_INVALID_SEVERITY = 104;
const ERR_INVALID_ISSUE_TYPE = 105;
const ERR_MAX_TICKETS_EXCEEDED = 106;
const ERR_INVALID_STATUS = 107;
const ERR_INVALID_ATTACHMENT = 108;
const ERR_INVALID_COMMENT = 109;
const ERR_AUTHORITY_NOT_VERIFIED = 110;
const ERR_INVALID_UPDATE_PARAM = 111;
const ERR_TICKET_CLOSED = 112;
const ERR_INVALID_ASSIGNEE = 113;
const ERR_INVALID_RESOLUTION_TIME = 114;

interface TicketMetadata {
  description: string;
  user: string;
  createdAt: number;
  status: string;
  priority: number;
  issueType: string;
  severity: number;
  assignedTo: string | null;
  resolutionTime: number | null;
  attachments: string[];
  comments: { comment: string; commenter: string; timestamp: number }[];
}

interface TicketHistoryEntry {
  action: string;
  actor: string;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TicketNFTMock {
  state: {
    nextId: number;
    maxTickets: number;
    mintFee: number;
    authorityContract: string | null;
    ticketMetadata: Map<number, TicketMetadata>;
    ticketHistory: Map<number, TicketHistoryEntry[]>;
    nftOwners: Map<number, string>;
  } = {
    nextId: 1,
    maxTickets: 10000,
    mintFee: 100,
    authorityContract: null,
    ticketMetadata: new Map(),
    ticketHistory: new Map(),
    nftOwners: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextId: 1,
      maxTickets: 10000,
      mintFee: 100,
      authorityContract: null,
      ticketMetadata: new Map(),
      ticketHistory: new Map(),
      nftOwners: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxTickets(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxTickets = newMax;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mintTicket(
    description: string,
    priority: number,
    issueType: string,
    severity: number,
    attachments: string[]
  ): Result<number> {
    if (this.state.nextId >= this.state.maxTickets) return { ok: false, value: ERR_MAX_TICKETS_EXCEEDED };
    if (!description || description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (priority < 1 || priority > 5) return { ok: false, value: ERR_INVALID_PRIORITY };
    if (!["connectivity", "installation", "hardware", "software", "billing"].includes(issueType)) return { ok: false, value: ERR_INVALID_ISSUE_TYPE };
    if (severity < 1 || severity > 10) return { ok: false, value: ERR_INVALID_SEVERITY };
    for (const attach of attachments) {
      if (attach.length > 256) return { ok: false, value: ERR_INVALID_ATTACHMENT };
    }
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextId;
    const metadata: TicketMetadata = {
      description,
      user: this.caller,
      createdAt: this.blockHeight,
      status: "open",
      priority,
      issueType,
      severity,
      assignedTo: null,
      resolutionTime: null,
      attachments,
      comments: [],
    };
    this.state.ticketMetadata.set(id, metadata);
    this.state.ticketHistory.set(id, [{ action: "created", actor: this.caller, timestamp: this.blockHeight }]);
    this.state.nftOwners.set(id, this.caller);
    this.state.nextId++;
    return { ok: true, value: id };
  }

  getMetadata(id: number): Result<TicketMetadata | null> {
    const metadata = this.state.ticketMetadata.get(id) || null;
    return { ok: true, value: metadata };
  }

  getHistory(id: number): Result<TicketHistoryEntry[]> {
    return { ok: true, value: this.state.ticketHistory.get(id) || [] };
  }

  getOwner(id: number): Result<string | null> {
    return { ok: true, value: this.state.nftOwners.get(id) || null };
  }

  updateStatus(id: number, newStatus: string): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (metadata.user !== this.caller) return { ok: false, value: false };
    if (metadata.status === "closed") return { ok: false, value: false };
    if (!["open", "in-progress", "resolved", "closed"].includes(newStatus)) return { ok: false, value: false };
    metadata.status = newStatus;
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: `status-updated-to-${newStatus}`, actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  assignTicket(id: number, assignee: string): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (metadata.user !== this.caller) return { ok: false, value: false };
    if (assignee === this.caller) return { ok: false, value: false };
    metadata.assignedTo = assignee;
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "assigned", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  addComment(id: number, comment: string): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (metadata.comments.length >= 10) return { ok: false, value: false };
    if (!comment || comment.length > 512) return { ok: false, value: false };
    metadata.comments.push({ comment, commenter: this.caller, timestamp: this.blockHeight });
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "comment-added", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  resolveTicket(id: number, resolutionTime: number): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (!metadata.assignedTo) return { ok: false, value: false };
    if (metadata.assignedTo !== this.caller) return { ok: false, value: false };
    if (resolutionTime <= this.blockHeight) return { ok: false, value: false };
    metadata.status = "resolved";
    metadata.resolutionTime = resolutionTime;
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "resolved", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  closeTicket(id: number): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (metadata.user !== this.caller) return { ok: false, value: false };
    if (metadata.status !== "resolved") return { ok: false, value: false };
    metadata.status = "closed";
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "closed", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  transferTicket(id: number, recipient: string): Result<boolean> {
    if (this.state.nftOwners.get(id) !== this.caller) return { ok: false, value: false };
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    this.state.nftOwners.set(id, recipient);
    metadata.user = recipient;
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "transferred", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  addAttachment(id: number, attachment: string): Result<boolean> {
    const metadata = this.state.ticketMetadata.get(id);
    if (!metadata) return { ok: false, value: false };
    if (metadata.user !== this.caller) return { ok: false, value: false };
    if (metadata.attachments.length >= 5) return { ok: false, value: false };
    if (attachment.length > 256) return { ok: false, value: false };
    metadata.attachments.push(attachment);
    this.state.ticketMetadata.set(id, metadata);
    const history = this.state.ticketHistory.get(id) || [];
    history.push({ action: "attachment-added", actor: this.caller, timestamp: this.blockHeight });
    this.state.ticketHistory.set(id, history);
    return { ok: true, value: true };
  }

  getTicketCount(): Result<number> {
    return { ok: true, value: this.state.nextId };
  }
}

describe("TicketNFT Contract Tests", () => {
  let contract: TicketNFTMock;

  beforeEach(() => {
    contract = new TicketNFTMock();
    contract.reset();
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    expect(result.ok).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
  });

  it("sets max tickets successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    const result = contract.setMaxTickets(5000);
    expect(result.ok).toBe(true);
    expect(contract.state.maxTickets).toBe(5000);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    const result = contract.setMintFee(200);
    expect(result.ok).toBe(true);
    expect(contract.state.mintFee).toBe(200);
  });

  it("mints a ticket successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    const result = contract.mintTicket("Internet outage", 3, "connectivity", 7, ["link1", "link2"]);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.description).toBe("Internet outage");
    expect(metadata?.priority).toBe(3);
    expect(metadata?.issueType).toBe("connectivity");
    expect(metadata?.severity).toBe(7);
    expect(metadata?.attachments).toEqual(["link1", "link2"]);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", to: "ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP" }]);
  });

  it("rejects mint without authority", () => {
    const result = contract.mintTicket("Issue", 1, "hardware", 5, []);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid priority", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    const result = contract.mintTicket("Issue", 6, "software", 5, []);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRIORITY);
  });

  it("updates status successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 2, "billing", 4, []);
    const result = contract.updateStatus(1, "in-progress");
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.status).toBe("in-progress");
  });

  it("assigns ticket successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 1, "installation", 6, []);
    const result = contract.assignTicket(1, "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.assignedTo).toBe("ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
  });

  it("adds comment successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 4, "connectivity", 8, []);
    const result = contract.addComment(1, "Need more info");
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.comments[0].comment).toBe("Need more info");
  });

  it("resolves ticket successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 3, "hardware", 9, []);
    contract.assignTicket(1, "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
    contract.caller = "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V";
    contract.blockHeight = 10;
    const result = contract.resolveTicket(1, 20);
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.status).toBe("resolved");
    expect(metadata?.resolutionTime).toBe(20);
  });

  it("closes ticket successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 5, "software", 10, []);
    contract.assignTicket(1, "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
    contract.caller = "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V";
    contract.blockHeight = 10;
    contract.resolveTicket(1, 20);
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const result = contract.closeTicket(1);
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.status).toBe("closed");
  });

  it("transfers ticket successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 1, "billing", 3, []);
    const result = contract.transferTicket(1, "ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
    expect(result.ok).toBe(true);
    const owner = contract.getOwner(1).value;
    expect(owner).toBe("ST3V1F3QJ3T5DMWFZY4HCYF3TVYKSNTVPW7V2V36V");
  });

  it("adds attachment successfully", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue", 2, "connectivity", 5, []);
    const result = contract.addAttachment(1, "new-link");
    expect(result.ok).toBe(true);
    const metadata = contract.getMetadata(1).value;
    expect(metadata?.attachments).toEqual(["new-link"]);
  });

  it("gets ticket count correctly", () => {
    contract.setAuthorityContract("ST2CY5V39NHDPWSXMW9QDT3HC3DC0X8P1MK8HR3CP");
    contract.mintTicket("Issue1", 1, "hardware", 4, []);
    contract.mintTicket("Issue2", 3, "software", 6, []);
    const result = contract.getTicketCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(3);
  });
});
import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_RATING = 101;
const ERR_INVALID_LOCATION = 104;
const ERR_INVALID_SPECIALTY = 105;
const ERR_INVALID_FEE = 107;
const ERR_INSTALLER_ALREADY_EXISTS = 108;
const ERR_INSTALLER_NOT_FOUND = 109;
const ERR_INSTALLER_NOT_VERIFIED = 110;
const ERR_MAX_INSTALLERS_EXCEEDED = 112;
const ERR_INVALID_ASSIGNMENT = 113;
const ERR_TICKET_NOT_ASSIGNED = 114;
const ERR_AUTHORITY_NOT_VERIFIED = 116;
const ERR_INVALID_CERTIFICATION = 117;
const ERR_INVALID_EXPERIENCE = 118;

interface Installer {
  principal: string;
  name: string;
  location: string;
  specialty: string;
  rating: number;
  verified: boolean;
  availability: boolean;
  fee: number;
  timestamp: number;
  creator: string;
  certification: string;
  experience: number;
}

interface Assignment {
  ticketId: number;
  installerId: number;
  assignedAt: number;
  status: string;
  updater: string;
}

interface AssignmentHistoryEntry {
  ticketId: number;
  installerId: number;
  assignedAt: number;
  status: string;
}

interface InstallerUpdate {
  updateName: string;
  updateLocation: string;
  updateFee: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class InstallerRegistryMock {
  state: {
    nextInstallerId: number;
    maxInstallers: number;
    registrationFee: number;
    authorityContract: string | null;
    installers: Map<number, Installer>;
    installersByPrincipal: Map<string, number>;
    assignments: Map<number, Assignment>;
    assignmentHistory: Map<number, AssignmentHistoryEntry[]>;
    installerUpdates: Map<number, InstallerUpdate>;
  } = {
    nextInstallerId: 0,
    maxInstallers: 500,
    registrationFee: 500,
    authorityContract: null,
    installers: new Map(),
    installersByPrincipal: new Map(),
    assignments: new Map(),
    assignmentHistory: new Map(),
    installerUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextInstallerId: 0,
      maxInstallers: 500,
      registrationFee: 500,
      authorityContract: null,
      installers: new Map(),
      installersByPrincipal: new Map(),
      assignments: new Map(),
      assignmentHistory: new Map(),
      installerUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerInstaller(
    name: string,
    location: string,
    specialty: string,
    fee: number,
    certification: string,
    experience: number
  ): Result<number> {
    if (this.state.nextInstallerId >= this.state.maxInstallers) return { ok: false, value: ERR_MAX_INSTALLERS_EXCEEDED };
    if (!name || name.length > 100) return { ok: false, value: ERR_INVALID_CERTIFICATION };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["fiber", "wifi", "satellite", "general"].includes(specialty)) return { ok: false, value: ERR_INVALID_SPECIALTY };
    if (fee <= 0) return { ok: false, value: ERR_INVALID_FEE };
    if (!certification || certification.length > 100) return { ok: false, value: ERR_INVALID_CERTIFICATION };
    if (experience < 0) return { ok: false, value: ERR_INVALID_EXPERIENCE };
    if (this.state.installersByPrincipal.has(this.caller)) return { ok: false, value: ERR_INSTALLER_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextInstallerId;
    const installer: Installer = {
      principal: this.caller,
      name,
      location,
      specialty,
      rating: 0,
      verified: false,
      availability: true,
      fee,
      timestamp: this.blockHeight,
      creator: this.caller,
      certification,
      experience,
    };
    this.state.installers.set(id, installer);
    this.state.installersByPrincipal.set(this.caller, id);
    this.state.nextInstallerId++;
    return { ok: true, value: id };
  }

  getInstaller(id: number): Installer | null {
    return this.state.installers.get(id) || null;
  }

  getInstallerByPrincipal(p: string): Installer | null {
    const id = this.state.installersByPrincipal.get(p);
    if (id === undefined) return null;
    return this.getInstaller(id);
  }

  updateInstaller(id: number, updateName: string, updateLocation: string, updateFee: number): Result<boolean> {
    const installer = this.state.installers.get(id);
    if (!installer) return { ok: false, value: false };
    if (installer.creator !== this.caller) return { ok: false, value: false };
    if (!updateName || updateName.length > 100) return { ok: false, value: false };
    if (!updateLocation || updateLocation.length > 100) return { ok: false, value: false };
    if (updateFee <= 0) return { ok: false, value: false };

    const updated: Installer = {
      ...installer,
      name: updateName,
      location: updateLocation,
      fee: updateFee,
      timestamp: this.blockHeight,
    };
    this.state.installers.set(id, updated);
    this.state.installerUpdates.set(id, {
      updateName,
      updateLocation,
      updateFee,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  verifyInstaller(id: number, verified: boolean): Result<boolean> {
    const installer = this.state.installers.get(id);
    if (!installer) return { ok: false, value: false };
    if (!this.state.authorityContract || this.caller !== this.state.authorityContract) return { ok: false, value: false };
    installer.verified = verified;
    this.state.installers.set(id, installer);
    return { ok: true, value: true };
  }

  updateRating(id: number, newRating: number): Result<boolean> {
    const installer = this.state.installers.get(id);
    if (!installer) return { ok: false, value: false };
    if (installer.creator !== this.caller) return { ok: false, value: false };
    if (newRating < 0 || newRating > 100) return { ok: false, value: false };
    installer.rating = newRating;
    this.state.installers.set(id, installer);
    return { ok: true, value: true };
  }

  assignToTicket(ticketId: number, installerId: number): Result<boolean> {
    const installer = this.state.installers.get(installerId);
    const existing = this.state.assignments.get(ticketId);
    if (!installer) return { ok: false, value: false };
    if (!installer.verified) return { ok: false, value: ERR_INSTALLER_NOT_VERIFIED };
    if (!installer.availability) return { ok: false, value: ERR_INVALID_ASSIGNMENT };
    if (existing) return { ok: false, value: ERR_INVALID_ASSIGNMENT };

    this.state.assignments.set(ticketId, {
      ticketId,
      installerId,
      assignedAt: this.blockHeight,
      status: "assigned",
      updater: this.caller,
    });

    let history = this.state.assignmentHistory.get(ticketId) || [];
    history.push({
      ticketId,
      installerId,
      assignedAt: this.blockHeight,
      status: "assigned",
    });
    if (history.length > 20) history = history.slice(-20);
    this.state.assignmentHistory.set(ticketId, history);

    installer.availability = false;
    this.state.installers.set(installerId, installer);
    return { ok: true, value: true };
  }

  updateAssignmentStatus(ticketId: number, newStatus: string): Result<boolean> {
    const assignment = this.state.assignments.get(ticketId);
    if (!assignment) return { ok: false, value: false };
    const installer = this.state.installers.get(assignment.installerId);
    if (!installer || installer.principal !== this.caller) return { ok: false, value: false };

    assignment.status = newStatus;
    assignment.assignedAt = this.blockHeight;
    this.state.assignments.set(ticketId, assignment);

    installer.availability = newStatus === "completed";
    this.state.installers.set(assignment.installerId, installer);
    return { ok: true, value: true };
  }

  getAssignments(ticketId: number): Assignment | null {
    return this.state.assignments.get(ticketId) || null;
  }

  getAssignmentHistory(ticketId: number): AssignmentHistoryEntry[] {
    return this.state.assignmentHistory.get(ticketId) || [];
  }

  getInstallerCount(): Result<number> {
    return { ok: true, value: this.state.nextInstallerId };
  }

  checkInstallerExistence(p: string): Result<boolean> {
    return { ok: true, value: this.state.installersByPrincipal.has(p) };
  }
}

describe("InstallerRegistry", () => {
  let contract: InstallerRegistryMock;

  beforeEach(() => {
    contract = new InstallerRegistryMock();
    contract.reset();
  });

  it("registers an installer successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerInstaller(
      "John Doe",
      "City Center",
      "fiber",
      200,
      "Certified Fiber Tech",
      5
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const installer = contract.getInstaller(0);
    expect(installer?.name).toBe("John Doe");
    expect(installer?.location).toBe("City Center");
    expect(installer?.specialty).toBe("fiber");
    expect(installer?.fee).toBe(200);
    expect(installer?.certification).toBe("Certified Fiber Tech");
    expect(installer?.experience).toBe(5);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate installer registration", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "John Doe",
      "City Center",
      "fiber",
      200,
      "Certified Fiber Tech",
      5
    );
    contract.caller = "ST3TEST";
    const result = contract.registerInstaller(
      "Jane Smith",
      "Suburb",
      "wifi",
      150,
      "Wifi Specialist",
      3
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    contract.caller = "ST1TEST";
    const trueDuplicate = contract.registerInstaller(
      "John Doe Again",
      "City Center",
      "general",
      100,
      "General Cert",
      2
    );
    expect(trueDuplicate.ok).toBe(false);
    expect(trueDuplicate.value).toBe(ERR_INSTALLER_ALREADY_EXISTS);
  });

  it("rejects registration without authority", () => {
    const result = contract.registerInstaller(
      "No Auth",
      "Remote",
      "fiber",
      200,
      "Cert",
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid specialty", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerInstaller(
      "Invalid Spec",
      "City",
      "invalid",
      200,
      "Cert",
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SPECIALTY);
  });

  it("rejects invalid fee", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerInstaller(
      "Zero Fee",
      "City",
      "fiber",
      0,
      "Cert",
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE);
  });

  it("updates an installer successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Old Name",
      "Old Location",
      "fiber",
      200,
      "Old Cert",
      5
    );
    const result = contract.updateInstaller(0, "New Name", "New Location", 250);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const updated = contract.getInstaller(0);
    expect(updated?.name).toBe("New Name");
    expect(updated?.location).toBe("New Location");
    expect(updated?.fee).toBe(250);
    const update = contract.state.installerUpdates.get(0);
    expect(update?.updateName).toBe("New Name");
    expect(update?.updateFee).toBe(250);
  });

  it("rejects update for non-existent installer", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateInstaller(99, "New", "Loc", 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Test",
      "Loc",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2FAKE";
    const result = contract.updateInstaller(0, "New", "NewLoc", 250);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("verifies an installer successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "To Verify",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2TEST";
    const result = contract.verifyInstaller(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const verified = contract.getInstaller(0);
    expect(verified?.verified).toBe(true);
  });

  it("rejects verification without authority", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Unverified",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.verifyInstaller(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates rating successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Rate Me",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.updateRating(0, 85);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const rated = contract.getInstaller(0);
    expect(rated?.rating).toBe(85);
  });

  it("rejects invalid rating", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Invalid Rate",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.updateRating(0, 101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("assigns to ticket successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Assign Me",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2TEST";
    contract.verifyInstaller(0, true);
    contract.caller = "ST1TEST";
    const result = contract.assignToTicket(123, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const assigned = contract.getAssignments(123);
    expect(assigned?.status).toBe("assigned");
    const installer = contract.getInstaller(0);
    expect(installer?.availability).toBe(false);
    const history = contract.getAssignmentHistory(123);
    expect(history.length).toBe(1);
    expect(history[0].status).toBe("assigned");
  });

  it("rejects assignment to unverified installer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Unverified",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.assignToTicket(123, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSTALLER_NOT_VERIFIED);
  });

  it("rejects assignment when unavailable", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Unavailable",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2TEST";
    contract.verifyInstaller(0, true);
    contract.caller = "ST1TEST";
    contract.getInstaller(0)!.availability = false;
    const result = contract.assignToTicket(123, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ASSIGNMENT);
  });

  it("updates assignment status successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Update Status",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2TEST";
    contract.verifyInstaller(0, true);
    contract.caller = "ST1TEST";
    contract.assignToTicket(123, 0);
    const result = contract.updateAssignmentStatus(123, "completed");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const updatedAssign = contract.getAssignments(123);
    expect(updatedAssign?.status).toBe("completed");
    const installer = contract.getInstaller(0);
    expect(installer?.availability).toBe(true);
  });

  it("rejects status update for non-installer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Not Updater",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    contract.caller = "ST2TEST";
    contract.verifyInstaller(0, true);
    contract.caller = "ST1TEST";
    contract.assignToTicket(123, 0);
    contract.caller = "ST3FAKE";
    const result = contract.updateAssignmentStatus(123, "completed");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
  });

  it("returns correct installer count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Count1",
      "Loc1",
      "fiber",
      200,
      "Cert1",
      5
    );
    contract.caller = "ST3TEST";
    contract.registerInstaller(
      "Count2",
      "Loc2",
      "wifi",
      150,
      "Cert2",
      3
    );
    const result = contract.getInstallerCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks installer existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerInstaller(
      "Exists",
      "City",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.checkInstallerExistence("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const nonExist = contract.checkInstallerExistence("ST3FAKE");
    expect(nonExist.ok).toBe(true);
    expect(nonExist.value).toBe(false);
  });

  it("rejects registration with max installers exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxInstallers = 1;
    contract.registerInstaller(
      "First",
      "Loc",
      "fiber",
      200,
      "Cert",
      5
    );
    const result = contract.registerInstaller(
      "Second",
      "Loc2",
      "wifi",
      150,
      "Cert2",
      3
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_INSTALLERS_EXCEEDED);
  });

  it("parses parameters with Clarity types", () => {
    const name = stringAsciiCV("Test Name");
    const location = stringAsciiCV("Test Loc");
    const specialty = stringAsciiCV("fiber");
    const fee = uintCV(200);
    const cert = stringAsciiCV("Test Cert");
    const exp = uintCV(5);
    expect(name.value).toBe("Test Name");
    expect(fee.value).toEqual(BigInt(200));
  });
});
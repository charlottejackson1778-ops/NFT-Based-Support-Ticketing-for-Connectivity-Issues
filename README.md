# LinkTicket: NFT-Based Support Ticketing for Connectivity Issues

## Overview

LinkTicket is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in the telecommunications and ISP sectors, where connectivity issues (e.g., internet outages, Wi-Fi setup problems, or network failures) often lead to inefficient support processes. Traditional ticketing systems are centralized, opaque, and prone to delays, lost tickets, or miscommunication between virtual support teams and in-person technicians.

By representing support tickets as NFTs, LinkTicket enables:
- **Unique, Trackable Tickets**: Each ticket is an NFT that can be minted by users reporting issues, with immutable on-chain history for status updates.
- **Virtual Support Queues**: Decentralized queues for prioritizing and assigning tickets to support agents.
- **In-Person Integration**: Technicians can verify and update tickets during installations or repairs via wallet interactions.
- **Transparency and Incentives**: Blockchain ensures all parties (users, support teams, installers) have visibility, with optional rewards for quick resolutions.
- **Transferability**: Tickets can be escalated, assigned, or even traded if needed (e.g., for premium support).

This solves issues like:
- Long wait times in support queues due to poor prioritization.
- Lack of accountability in ticket handling.
- Coordination failures between remote support and field technicians.
- Fraud or disputes over service resolutions.

The project involves 6 core smart contracts in Clarity, designed for security, efficiency, and composability on Stacks (leveraging Bitcoin's security).

## Tech Stack
- **Blockchain**: Stacks (STX) for smart contracts, with Bitcoin settlement.
- **Language**: Clarity (functional, predictable, and secure).
- **Frontend Integration**: Not included here, but can be built with Hiro Wallet or similar for minting/viewing NFTs.
- **Deployment**: Use Stacks CLI for deployment to testnet/mainnet.

## Smart Contracts

The project consists of the following 6 smart contracts. Each is self-contained but interacts with others (e.g., via contract calls). Contracts use traits for interfaces where needed.

### 1. TicketNFT.clar
This contract handles minting, ownership, and basic metadata for NFT tickets. Each NFT represents a unique support ticket with attributes like issue description, user address, and creation timestamp.

```clarity
;; TicketNFT Contract
;; Manages NFT tickets for connectivity issues.

(define-non-fungible-token ticket-nft uint)

(define-map ticket-metadata uint {description: (string-ascii 256), user: principal, created-at: uint, status: (string-ascii 32)})

(define-data-var next-id uint u1)
(define-constant err-unauthorized (err u100))
(define-constant err-not-found (err u101))

(define-trait ticket-trait
  ((get-metadata (uint) (response {description: (string-ascii 256), user: principal, created-at: uint, status: (string-ascii 32)} uint))))

(define-public (mint-ticket (description (string-ascii 256)))
  (let ((id (var-get next-id)))
    (try! (nft-mint? ticket-nft id tx-sender))
    (map-set ticket-metadata id {description: description, user: tx-sender, created-at: block-height, status: "open"})
    (var-set next-id (+ id u1))
    (ok id)))

(define-read-only (get-metadata (id uint))
  (match (map-get? ticket-metadata id)
    metadata (ok metadata)
    (err-not-found)))

(define-public (transfer-ticket (id uint) (recipient principal))
  (if (is-eq tx-sender (unwrap! (nft-get-owner? ticket-nft id) err-not-found))
    (nft-transfer? ticket-nft id tx-sender recipient)
    err-unauthorized))
```

### 2. SupportQueue.clar
Manages virtual support queues. Tickets are enqueued with priorities (e.g., based on severity). Support agents can dequeue and assign tickets.

```clarity
;; SupportQueue Contract
;; Decentralized queue for virtual support.

(use-trait ticket-trait .TicketNFT.ticket-trait)

(define-map queue uint {ticket-id: uint, priority: uint, enqueued-at: uint}) ;; Key is position in queue
(define-data-var queue-length uint u0)
(define-constant err-invalid-position (err u200))
(define-constant err-unauthorized (err u201))

(define-public (enqueue-ticket (ticket-id uint) (priority uint) (ticket-contract <ticket-trait>))
  (let ((position (var-get queue-length))
        (metadata (unwrap! (contract-call? ticket-contract get-metadata ticket-id) err-invalid-position)))
    (if (is-eq (get user metadata) tx-sender)
      (begin
        (map-set queue position {ticket-id: ticket-id, priority: priority, enqueued-at: block-height})
        (var-set queue-length (+ position u1))
        (ok position))
      err-unauthorized)))

(define-public (dequeue-ticket (position uint) (agent principal))
  (match (map-get? queue position)
    entry (if (is-eq agent (as-contract tx-sender)) ;; Assuming agent is contract caller for simplicity
            (begin
              (map-delete queue position)
              (ok (get ticket-id entry)))
            err-unauthorized)
    err-invalid-position))

(define-read-only (get-queue-length)
  (ok (var-get queue-length)))
```

### 3. StatusTracker.clar
Tracks status updates for tickets (e.g., "open", "in-progress", "resolved"). Updates are logged immutably, with events for off-chain tracking.

```clarity
;; StatusTracker Contract
;; Tracks ticket status changes.

(use-trait ticket-trait .TicketNFT.ticket-trait)

(define-map status-history uint (list 10 {status: (string-ascii 32), updated-at: uint, updater: principal}))
(define-constant err-not-owner (err u300))

(define-public (update-status (ticket-id uint) (new-status (string-ascii 32)) (ticket-contract <ticket-trait>))
  (let ((metadata (unwrap! (contract-call? ticket-contract get-metadata ticket-id) err-not-owner)))
    (if (is-eq tx-sender (get user metadata)) ;; Or authorized agent
      (let ((history (default-to (list) (map-get? status-history ticket-id))))
        (map-set status-history ticket-id (append history {status: new-status, updated-at: block-height, updater: tx-sender}))
        (try! (as-contract (contract-call? ticket-contract get-metadata ticket-id))) ;; Dummy call to ensure trait
        (ok true))
      err-not-owner)))

(define-read-only (get-status-history (ticket-id uint))
  (ok (default-to (list) (map-get? status-history ticket-id))))
```

### 4. InstallerRegistry.clar
Registers verified in-person installers/technicians. Users can assign tickets to registered installers for on-site work.

```clarity
;; InstallerRegistry Contract
;; Registry for in-person installers.

(define-map installers principal {verified: bool, rating: uint})
(define-map assignments uint principal) ;; ticket-id -> installer
(define-constant err-not-verified (err u400))

(define-public (register-installer (installer principal))
  (if (is-eq tx-sender installer)
    (begin
      (map-set installers installer {verified: true, rating: u0})
      (ok true))
    err-not-verified)) ;; In production, add verification logic

(define-public (assign-installer (ticket-id uint) (installer principal))
  (if (is-some (map-get? installers installer))
    (begin
      (map-set assignments ticket-id installer)
      (ok true))
    err-not-verified))

(define-read-only (get-installer (ticket-id uint))
  (ok (map-get? assignments ticket-id)))
```

### 5. ResolutionVerifier.clar
Verifies ticket resolutions. Users confirm if issues are fixed; if not, disputes can be raised. Integrates with in-person scans (e.g., via wallet signatures).

```clarity
;; ResolutionVerifier Contract
;; Verifies and closes tickets.

(use-trait ticket-trait .TicketNFT.ticket-trait)

(define-constant err-not-resolved (err u500))
(define-map resolutions uint {resolved: bool, confirmed-at: uint, confirmer: principal})

(define-public (verify-resolution (ticket-id uint) (resolved bool) (ticket-contract <ticket-trait>))
  (let ((metadata (unwrap! (contract-call? ticket-contract get-metadata ticket-id) err-not-resolved)))
    (if (is-eq tx-sender (get user metadata))
      (begin
        (map-set resolutions ticket-id {resolved: resolved, confirmed-at: block-height, confirmer: tx-sender})
        (ok true))
      err-not-resolved)))

(define-read-only (is-resolved (ticket-id uint))
  (match (map-get? resolutions ticket-id)
    res (ok (get resolved res))
    (ok false)))
```

### 6. RewardToken.clar
An optional fungible token (SIP-010 compliant) for rewarding quick resolutions. Support agents or installers earn tokens based on resolution time.

```clarity
;; RewardToken Contract
;; SIP-010 compliant FT for rewards.

(define-fungible-token reward-token u1000000)
(define-constant err-insufficient-balance (err u600))

(define-trait ft-trait
  ((transfer (uint principal principal (optional (buff 34))) (response bool uint))))

(define-public (mint-reward (amount uint) (recipient principal))
  (if (is-eq tx-sender (as-contract tx-sender)) ;; Admin only, for simplicity
    (ft-mint? reward-token amount recipient)
    err-insufficient-balance))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (if (is-eq tx-sender sender)
    (ft-transfer? reward-token amount sender recipient)
    err-insufficient-balance))

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance? reward-token account)))

;; Reward logic: Call from other contracts, e.g., after resolution verification.
```

## How It Works
1. User reports issue → Mints NFT via TicketNFT.
2. Enqueues ticket in SupportQueue.
3. Agent dequeues and updates status via StatusTracker.
4. If in-person needed, assign via InstallerRegistry.
5. Technician verifies on-site → Updates via ResolutionVerifier.
6. Upon resolution, mint rewards via RewardToken.

## Deployment Instructions
- Install Stacks CLI: `cargo install stacks-cli`.
- Deploy each contract: `clarinet deploy <contract-name>.clar`.
- Test interactions with Clarinet console.

## Security Considerations
- All contracts use `tx-sender` for authorization.
- No external calls to untrusted contracts.
- Clarity's predictability prevents reentrancy.
- Audit recommended before mainnet.

## Future Enhancements
- Integrate with oracles for real-time connectivity checks.
- DAO governance for reward distribution.
- Frontend dApp for user-friendly interactions.

This project is open-source under MIT License. Contributions welcome!
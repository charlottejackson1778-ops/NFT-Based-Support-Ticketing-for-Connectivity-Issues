;; TicketNFT Contract

(define-non-fungible-token ticket-nft uint)

(define-map ticket-metadata uint
  {
    description: (string-ascii 256),
    user: principal,
    created-at: uint,
    status: (string-ascii 32),
    priority: uint,
    issue-type: (string-ascii 50),
    severity: uint,
    assigned-to: (optional principal),
    resolution-time: (optional uint),
    attachments: (list 5 (string-ascii 256)),
    comments: (list 10 {comment: (string-ascii 512), commenter: principal, timestamp: uint})
  }
)

(define-map ticket-history uint (list 20 {action: (string-ascii 64), actor: principal, timestamp: uint}))

(define-data-var next-id uint u1)
(define-data-var max-tickets uint u10000)
(define-data-var mint-fee uint u100)
(define-data-var authority-contract (optional principal) none)

(define-constant err-unauthorized (err u100))
(define-constant err-not-found (err u101))
(define-constant err-invalid-description (err u102))
(define-constant err-invalid-priority (err u103))
(define-constant err-invalid-severity (err u104))
(define-constant err-invalid-issue-type (err u105))
(define-constant err-max-tickets-exceeded (err u106))
(define-constant err-invalid-status (err u107))
(define-constant err-invalid-attachment (err u108))
(define-constant err-invalid-comment (err u109))
(define-constant err-authority-not-verified (err u110))
(define-constant err-invalid-update-param (err u111))
(define-constant err-ticket-closed (err u112))
(define-constant err-invalid-assignee (err u113))
(define-constant err-invalid-resolution-time (err u114))

(define-trait ticket-trait
  (
    (get-metadata (uint) (response
      {
        description: (string-ascii 256),
        user: principal,
        created-at: uint,
        status: (string-ascii 32),
        priority: uint,
        issue-type: (string-ascii 50),
        severity: uint,
        assigned-to: (optional principal),
        resolution-time: (optional uint),
        attachments: (list 5 (string-ascii 256)),
        comments: (list 10 {comment: (string-ascii 512), commenter: principal, timestamp: uint})
      } uint))
    (get-history (uint) (response (list 20 {action: (string-ascii 64), actor: principal, timestamp: uint}) uint))
  )
)

(define-read-only (get-metadata (id uint))
  (match (map-get? ticket-metadata id)
    metadata (ok metadata)
    (err err-not-found)
  )
)

(define-read-only (get-history (id uint))
  (ok (default-to (list) (map-get? ticket-history id)))
)

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? ticket-nft id))
)

(define-read-only (get-next-id)
  (ok (var-get next-id))
)

(define-private (validate-description (desc (string-ascii 256)))
  (if (and (> (len desc) u0) (<= (len desc) u256))
    (ok true)
    (err err-invalid-description)
  )
)

(define-private (validate-priority (prio uint))
  (if (and (>= prio u1) (<= prio u5))
    (ok true)
    (err err-invalid-priority)
  )
)

(define-private (validate-severity (sev uint))
  (if (and (>= sev u1) (<= sev u10))
    (ok true)
    (err err-invalid-severity)
  )
)

(define-private (validate-issue-type (typ (string-ascii 50)))
  (if (or (is-eq typ "connectivity") (is-eq typ "installation") (is-eq typ "hardware") (is-eq typ "software") (is-eq typ "billing"))
    (ok true)
    (err err-invalid-issue-type)
  )
)

(define-private (validate-status (stat (string-ascii 32)))
  (if (or (is-eq stat "open") (is-eq stat "in-progress") (is-eq stat "resolved") (is-eq stat "closed"))
    (ok true)
    (err err-invalid-status)
  )
)

(define-private (validate-attachment (attach (string-ascii 256)))
  (if (<= (len attach) u256)
    (ok true)
    (err err-invalid-attachment)
  )
)

(define-private (validate-comment (comm (string-ascii 512)))
  (if (and (> (len comm) u0) (<= (len comm) u512))
    (ok true)
    (err err-invalid-comment)
  )
)

(define-private (validate-assignee (assignee principal))
  (if (not (is-eq assignee tx-sender))
    (ok true)
    (err err-invalid-assignee)
  )
)

(define-private (validate-resolution-time (time uint))
  (if (> time block-height)
    (ok true)
    (err err-invalid-resolution-time)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err err-authority-not-verified))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-tickets (new-max uint))
  (begin
    (asserts! (> new-max u0) (err err-invalid-update-param))
    (asserts! (is-some (var-get authority-contract)) (err err-authority-not-verified))
    (var-set max-tickets new-max)
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err err-invalid-update-param))
    (asserts! (is-some (var-get authority-contract)) (err err-authority-not-verified))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint-ticket
  (description (string-ascii 256))
  (priority uint)
  (issue-type (string-ascii 50))
  (severity uint)
  (attachments (list 5 (string-ascii 256)))
  )
  (let
    (
      (id (var-get next-id))
      (current-max (var-get max-tickets))
      (authority (var-get authority-contract))
    )
    (asserts! (< id current-max) (err err-max-tickets-exceeded))
    (try! (validate-description description))
    (try! (validate-priority priority))
    (try! (validate-issue-type issue-type))
    (try! (validate-severity severity))
    (fold check-attachment attachments (ok true))
    (asserts! (is-some authority) (err err-authority-not-verified))
    (try! (stx-transfer? (var-get mint-fee) tx-sender (unwrap! authority err-authority-not-verified)))
    (try! (nft-mint? ticket-nft id tx-sender))
    (map-set ticket-metadata id
      {
        description: description,
        user: tx-sender,
        created-at: block-height,
        status: "open",
        priority: priority,
        issue-type: issue-type,
        severity: severity,
        assigned-to: none,
        resolution-time: none,
        attachments: attachments,
        comments: (list)
      }
    )
    (map-set ticket-history id (list {action: "created", actor: tx-sender, timestamp: block-height}))
    (var-set next-id (+ id u1))
    (print {event: "ticket-minted", id: id})
    (ok id)
  )
)

(define-private (check-attachment (attach (string-ascii 256)) (prev (response bool uint)))
  (match prev
    ok-val (validate-attachment attach)
    err-val (err err-invalid-attachment)
  )
)

(define-public (update-status (id uint) (new-status (string-ascii 32)))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
    )
    (asserts! (is-eq tx-sender (get user metadata)) (err err-unauthorized))
    (asserts! (not (is-eq (get status metadata) "closed")) (err err-ticket-closed))
    (try! (validate-status new-status))
    (map-set ticket-metadata id (merge metadata {status: new-status}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: (concat "status-updated-to-" new-status), actor: tx-sender, timestamp: block-height}))
    (print {event: "status-updated", id: id, new-status: new-status})
    (ok true)
  )
)

(define-public (assign-ticket (id uint) (assignee principal))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
    )
    (asserts! (is-eq tx-sender (get user metadata)) (err err-unauthorized))
    (try! (validate-assignee assignee))
    (map-set ticket-metadata id (merge metadata {assigned-to: (some assignee)}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "assigned", actor: tx-sender, timestamp: block-height}))
    (print {event: "ticket-assigned", id: id, assignee: assignee})
    (ok true)
  )
)

(define-public (add-comment (id uint) (comment (string-ascii 512)))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
      (comments (get comments metadata))
    )
    (asserts! (< (len comments) u10) (err err-invalid-comment))
    (try! (validate-comment comment))
    (map-set ticket-metadata id (merge metadata {comments: (append comments {comment: comment, commenter: tx-sender, timestamp: block-height})}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "comment-added", actor: tx-sender, timestamp: block-height}))
    (print {event: "comment-added", id: id})
    (ok true)
  )
)

(define-public (resolve-ticket (id uint) (resolution-time uint))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
    )
    (asserts! (is-some (get assigned-to metadata)) (err err-unauthorized))
    (asserts! (is-eq tx-sender (unwrap! (get assigned-to metadata) (err err-unauthorized))) (err err-unauthorized))
    (try! (validate-resolution-time resolution-time))
    (map-set ticket-metadata id (merge metadata {status: "resolved", resolution-time: (some resolution-time)}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "resolved", actor: tx-sender, timestamp: block-height}))
    (print {event: "ticket-resolved", id: id})
    (ok true)
  )
)

(define-public (close-ticket (id uint))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
    )
    (asserts! (is-eq tx-sender (get user metadata)) (err err-unauthorized))
    (asserts! (is-eq (get status metadata) "resolved") (err err-invalid-status))
    (map-set ticket-metadata id (merge metadata {status: "closed"}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "closed", actor: tx-sender, timestamp: block-height}))
    (print {event: "ticket-closed", id: id})
    (ok true)
  )
)

(define-public (transfer-ticket (id uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (nft-get-owner? ticket-nft id) (err err-not-found))) (err err-unauthorized))
    (try! (nft-transfer? ticket-nft id tx-sender recipient))
    (let
      (
        (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
      )
      (map-set ticket-metadata id (merge metadata {user: recipient}))
      (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "transferred", actor: tx-sender, timestamp: block-height}))
      (print {event: "ticket-transferred", id: id, recipient: recipient})
    )
    (ok true)
  )
)

(define-public (add-attachment (id uint) (attachment (string-ascii 256)))
  (let
    (
      (metadata (unwrap! (map-get? ticket-metadata id) (err err-not-found)))
      (attachments (get attachments metadata))
    )
    (asserts! (is-eq tx-sender (get user metadata)) (err err-unauthorized))
    (asserts! (< (len attachments) u5) (err err-invalid-attachment))
    (try! (validate-attachment attachment))
    (map-set ticket-metadata id (merge metadata {attachments: (append attachments attachment)}))
    (map-set ticket-history id (append (default-to (list) (map-get? ticket-history id)) {action: "attachment-added", actor: tx-sender, timestamp: block-height}))
    (print {event: "attachment-added", id: id})
    (ok true)
  )
)

(define-read-only (get-ticket-count)
  (ok (var-get next-id))
)
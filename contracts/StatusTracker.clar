(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-STATUS u301)
(define-constant ERR-TICKET-NOT-FOUND u302)
(define-constant ERR-HISTORY-FULL u303)
(define-constant ERR-INVALID-ROLE u304)
(define-constant ERR-STATUS-NOT-UPDATED u305)
(define-constant ERR-MAX-HISTORY-EXCEEDED u306)

(define-data-var max-history-entries uint u10)
(define-data-var admin-principal principal tx-sender)

(define-map status-history
  uint
  (list 200 {status: (string-ascii 32), updated-at: uint, updater: principal, role: (string-ascii 20)}))

(define-map ticket-roles
  uint
  {user: principal, agent: (optional principal), admin: (optional principal)})

(define-map current-status
  uint
  {status: (string-ascii 32), last-updated: uint})

(define-private (validate-status (s (string-ascii 32)))
  (if (or
        (is-eq s "open")
        (is-eq s "in-progress")
        (is-eq s "escalated")
        (is-eq s "resolved")
        (is-eq s "closed"))
      (ok true)
      (err ERR-INVALID-STATUS)))

(define-private (validate-role (r (string-ascii 20)) (ticket-id uint))
  (let ((roles (unwrap! (map-get? ticket-roles ticket-id) (err ERR-TICKET-NOT-FOUND))))
    (if (or
          (is-eq r "user")
          (and (is-eq r "agent") (some (get agent roles)))
          (and (is-eq r "admin") (some (get admin roles)))
          (is-eq tx-sender (get user roles)))
        (ok true)
        (err ERR-INVALID-ROLE))))

(define-private (add-to-history (ticket-id uint) (new-status (string-ascii 32)) (role (string-ascii 20)))
  (let ((history (default-to (list) (map-get? status-history ticket-id)))
        (new-entry {status: new-status, updated-at: block-height, updater: tx-sender, role: role})
        (current-len (len history)))
    (if (> current-len (var-get max-history-entries))
        (let ((trimmed (slice? history u0 (- current-len u1))))
          (map-set status-history ticket-id (as-max-len? (append trimmed new-entry) u200)))
        (map-set status-history ticket-id (as-max-len? (append history new-entry) u200)))
    (ok true)))

(define-public (initialize-ticket-roles (ticket-id uint) (agent (optional principal)) (admin (optional principal)))
  (let ((user tx-sender))
    (asserts! (is-none (map-get? ticket-roles ticket-id)) (err ERR-TICKET-NOT-FOUND))
    (map-set ticket-roles ticket-id {user: user, agent: agent, admin: admin})
    (map-set current-status ticket-id {status: "open", last-updated: block-height})
    (ok true)))

(define-public (update-status (ticket-id uint) (new-status (string-ascii 32)) (role (string-ascii 20)))
  (begin
    (try! (validate-role role ticket-id))
    (try! (validate-status new-status))
    (try! (add-to-history ticket-id new-status role))
    (map-set current-status ticket-id {status: new-status, last-updated: block-height})
    (print {event: "status-updated", ticket: ticket-id, status: new-status, updater: tx-sender})
    (ok true)))

(define-public (revert-status (ticket-id uint) (target-height uint))
  (let ((history (unwrap! (map-get? status-history ticket-id) (err ERR-TICKET-NOT-FOUND)))
        (roles (unwrap! (map-get? ticket-roles ticket-id) (err ERR-TICKET-NOT-FOUND)))
        (is-admin (and (some (get admin roles)) (is-eq tx-sender (unwrap-panic (get admin roles))))))
    (asserts! is-admin (err ERR-NOT-AUTHORIZED))
    (asserts! (<= target-height (len history)) (err ERR-INVALID-STATUS))
    (match (element-at? history (- (len history) u1 target-height))
      target-entry
        (begin
          (map-set current-status ticket-id {status: (get status target-entry), last-updated: (get updated-at target-entry)})
          (ok true))
      (err ERR-STATUS-NOT-UPDATED))))

(define-public (set-max-history (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (> new-max u0) (<= new-max u50)) (err ERR-INVALID-STATUS))
    (var-set max-history-entries new-max)
    (ok true)))

(define-read-only (get-current-status (ticket-id uint))
  (map-get? current-status ticket-id))

(define-read-only (get-status-history (ticket-id uint))
  (ok (default-to (list) (map-get? status-history ticket-id))))

(define-read-only (get-roles (ticket-id uint))
  (map-get? ticket-roles ticket-id))

(define-public (assign-agent (ticket-id uint) (new-agent principal))
  (let ((roles (unwrap! (map-get? ticket-roles ticket-id) (err ERR-TICKET-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get user roles)) (err ERR-NOT-AUTHORIZED))
    (map-set ticket-roles ticket-id {user: (get user roles), agent: (some new-agent), admin: (get admin roles)})
    (ok true)))

(define-public (assign-admin (ticket-id uint) (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (let ((roles (unwrap! (map-get? ticket-roles ticket-id) (err ERR-TICKET-NOT-FOUND))))
      (map-set ticket-roles ticket-id {user: (get user roles), agent: (get agent roles), admin: (some new-admin)})
      (ok true))))

(define-public (get-admin)
  (ok (var-get admin-principal)))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set admin-principal new-admin)
    (ok true)))
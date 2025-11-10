(impl-trait .trait-installer-registry.installer-registry-trait)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-RATING u101)
(define-constant ERR-INVALID-MAX-RATING u102)
(define-constant ERR-INVALID-MIN-RATING u103)
(define-constant ERR-INVALID-LOCATION u104)
(define-constant ERR-INVALID-SPECIALTY u105)
(define-constant ERR-INVALID-AVAILABILITY u106)
(define-constant ERR-INVALID-FEE u107)
(define-constant ERR-INSTALLER-ALREADY-EXISTS u108)
(define-constant ERR-INSTALLER-NOT-FOUND u109)
(define-constant ERR-INSTALLER-NOT-VERIFIED u110)
(define-constant ERR-INVALID-TIMESTAMP u111)
(define-constant ERR-MAX-INSTALLERS-EXCEEDED u112)
(define-constant ERR-INVALID-ASSIGNMENT u113)
(define-constant ERR-TICKET-NOT-ASSIGNED u114)
(define-constant ERR-INVALID-UPDATE-PARAM u115)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u116)
(define-constant ERR-INVALID-CERTIFICATION u117)
(define-constant ERR-INVALID-EXPERIENCE u118)

(define-data-var next-installer-id uint u0)
(define-data-var max-installers uint u500)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map installers
  uint
  {
    principal: principal,
    name: (string-ascii 100),
    location: (string-ascii 100),
    specialty: (string-ascii 50),
    rating: uint,
    verified: bool,
    availability: bool,
    fee: uint,
    timestamp: uint,
    creator: principal,
    certification: (string-ascii 100),
    experience: uint
  }
)

(define-map installers-by-principal
  principal
  uint)

(define-map assignments
  uint
  {
    ticket-id: uint,
    installer-id: uint,
    assigned-at: uint,
    status: (string-ascii 32),
    updater: principal
  }
)

(define-map assignment-history
  uint
  (list 20 {
    ticket-id: uint,
    installer-id: uint,
    assigned-at: uint,
    status: (string-ascii 32)
  })
)

(define-map installer-updates
  uint
  {
    update-name: (string-ascii 100),
    update-location: (string-ascii 100),
    update-fee: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-installer (id uint))
  (map-get? installers id)
)

(define-read-only (get-installer-by-principal (p principal))
  (match (map-get? installers-by-principal p)
    some-id (get-installer some-id)
    none
  )
)

(define-read-only (get-assignments (ticket-id uint))
  (map-get? assignments ticket-id)
)

(define-read-only (get-assignment-history (ticket-id uint))
  (map-get? assignment-history ticket-id)
)

(define-read-only (get-installer-updates (id uint))
  (map-get? installer-updates id)
)

(define-read-only (is-installer-registered (p principal))
  (is-some (map-get? installers-by-principal p))
)

(define-read-only (get-installer-count)
  (var-get next-installer-id)
)

(define-private (validate-name (name (string-ascii 100)))
  (if (and (> (len name) u0) (<= (len name) u100))
      (ok true)
      (err ERR-INVALID-UPDATE-PARAM))
)

(define-private (validate-location (loc (string-ascii 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-specialty (spec (string-ascii 50)))
  (if (or (is-eq spec "fiber") (is-eq spec "wifi") (is-eq spec "satellite") (is-eq spec "general"))
      (ok true)
      (err ERR-INVALID-SPECIALTY))
)

(define-private (validate-rating (rating uint))
  (if (and (>= rating u0) (<= rating u100))
      (ok true)
      (err ERR-INVALID-RATING))
)

(define-private (validate-availability (avail bool))
  (ok true)
)

(define-private (validate-fee (fee uint))
  (if (> fee u0)
      (ok true)
      (err ERR-INVALID-FEE))
)

(define-private (validate-certification (cert (string-ascii 100)))
  (if (and (> (len cert) u0) (<= (len cert) u100))
      (ok true)
      (err ERR-INVALID-CERTIFICATION))
)

(define-private (validate-experience (exp uint))
  (if (>= exp u0)
      (ok true)
      (err ERR-INVALID-EXPERIENCE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-installers (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-RATING))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-installers new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (verify-installer (id uint) (verified bool))
  (let ((installer (unwrap! (map-get? installers id) (err ERR-INSTALLER-NOT-FOUND)))
        (authority (var-get authority-contract)))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (is-eq tx-sender (unwrap! authority (tuple (t 0)))) (err ERR-NOT-AUTHORIZED))
    (map-set installers id (merge installer { verified: verified }))
    (ok true)
  )
)

(define-public (update-rating (id uint) (new-rating uint))
  (let ((installer (unwrap! (map-get? installers id) (err ERR-INSTALLER-NOT-FOUND))))
    (try! (validate-rating new-rating))
    (asserts! (is-eq tx-sender (get creator installer)) (err ERR-NOT-AUTHORIZED))
    (map-set installers id (merge installer { rating: new-rating }))
    (ok true)
  )
)

(define-public (register-installer
  (name (string-ascii 100))
  (location (string-ascii 100))
  (specialty (string-ascii 50))
  (fee uint)
  (certification (string-ascii 100))
  (experience uint)
)
  (let (
        (next-id (var-get next-installer-id))
        (current-max (var-get max-installers))
        (principal tx-sender)
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-INSTALLERS-EXCEEDED))
    (try! (validate-name name))
    (try! (validate-location location))
    (try! (validate-specialty specialty))
    (try! (validate-fee fee))
    (try! (validate-certification certification))
    (try! (validate-experience experience))
    (asserts! (is-none (map-get? installers-by-principal principal)) (err ERR-INSTALLER-ALREADY-EXISTS))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (let ((authority-recipient (unwrap! authority (tuple (t 0)))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set installers next-id
      {
        principal: principal,
        name: name,
        location: location,
        specialty: specialty,
        rating: u0,
        verified: false,
        availability: true,
        fee: fee,
        timestamp: block-height,
        creator: tx-sender,
        certification: certification,
        experience: experience
      }
    )
    (map-set installers-by-principal principal next-id)
    (var-set next-installer-id (+ next-id u1))
    (print { event: "installer-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-installer
  (id uint)
  (update-name (string-ascii 100))
  (update-location (string-ascii 100))
  (update-fee uint)
)
  (let ((installer (unwrap! (map-get? installers id) (err ERR-INSTALLER-NOT-FOUND))))
    (asserts! (is-eq (get creator installer) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-name update-name))
    (try! (validate-location update-location))
    (try! (validate-fee update-fee))
    (map-set installers id
      {
        principal: (get principal installer),
        name: update-name,
        location: update-location,
        specialty: (get specialty installer),
        rating: (get rating installer),
        verified: (get verified installer),
        availability: (get availability installer),
        fee: update-fee,
        timestamp: block-height,
        creator: (get creator installer),
        certification: (get certification installer),
        experience: (get experience installer)
      }
    )
    (map-set installer-updates id
      {
        update-name: update-name,
        update-location: update-location,
        update-fee: update-fee,
        update-timestamp: block-height,
        updater: tx-sender
      }
    )
    (print { event: "installer-updated", id: id })
    (ok true)
  )
)

(define-public (assign-to-ticket (ticket-id uint) (installer-id uint))
  (let (
        (installer (unwrap! (map-get? installers installer-id) (err ERR-INSTALLER-NOT-FOUND)))
        (assignment (map-get? assignments ticket-id))
      )
    (asserts! (get verified installer) (err ERR-INSTALLER-NOT-VERIFIED))
    (asserts! (get availability installer) (err ERR-INVALID-AVAILABILITY))
    (asserts! (is-none assignment) (err ERR-INVALID-ASSIGNMENT))
    (map-set assignments ticket-id
      {
        ticket-id: ticket-id,
        installer-id: installer-id,
        assigned-at: block-height,
        status: "assigned",
        updater: tx-sender
      }
    )
    (let ((history (default-to (list) (map-get? assignment-history ticket-id))))
      (map-set assignment-history ticket-id
        (as-max-len?
          (append
            history
            {
              ticket-id: ticket-id,
              installer-id: installer-id,
              assigned-at: block-height,
              status: "assigned"
            }
          )
          u20
        )
      )
    )
    (map-set installers installer-id (merge installer { availability: false }))
    (print { event: "ticket-assigned", ticket-id: ticket-id, installer-id: installer-id })
    (ok true)
  )
)

(define-public (update-assignment-status (ticket-id uint) (new-status (string-ascii 32)))
  (let ((assignment (unwrap! (map-get? assignments ticket-id) (err ERR-TICKET-NOT-ASSIGNED))))
    (asserts! (is-eq tx-sender (get principal (unwrap! (map-get? installers (get installer-id assignment)) (tuple (t 0))))) (err ERR-NOT-AUTHORIZED))
    (map-set assignments ticket-id
      (merge assignment { status: new-status, assigned-at: block-height })
    )
    (map-set installers (get installer-id assignment)
      (merge
        (unwrap! (map-get? installers (get installer-id assignment)) (tuple (t 0)))
        { availability: (is-eq new-status "completed") }
      )
    )
    (ok true)
  )
)

(define-public (check-installer-existence (p principal))
  (ok (is-installer-registered p))
)
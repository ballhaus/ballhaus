;; -*- Lisp -*-

(defpackage :extract-data
  (:use :cl))

(in-package :extract-data)

(defvar *objects*)
(defvar *people*)
(defvar *next-object-id*)

(defun initialize-memory ()
  (cl-mysql:connect :host "localhost" :database "ballhaus" :password "ognep1")
  (setf *objects* (make-hash-table :test #'equal)
        *people* (make-hash-table :test #'equal)
        *next-object-id* 0))

(defun remove-plist-values (values plist &key (test #'eql))
  (let (retval)
    (alexandria:doplist (key value plist (nreverse retval))
      (unless (member value values :test test)
        (push key retval)
        (push value retval)))))

(defun make-object (type &rest properties)
  (let ((id (get-id))
        (table (or (gethash type *objects*)
                   (setf (gethash type *objects*) (make-hash-table :test #'equal)))))
    (setf (gethash id table)
          (list* :id id
                 (remove-plist-values '(nil) properties)))))

(defun plist-hash-table (plist &key (test #'eql))
  (let ((hash-table (make-hash-table :test test)))
    (alexandria:doplist (key value plist hash-table)
      (when value
        (setf (gethash (string-downcase key) hash-table)
              (typecase value
                (local-time:timestamp (local-time:format-rfc1123-timestring nil value))
                (t value)))))))

(defun get-id ()
  (incf *next-object-id*))

(defun plist-reader (key)
  (lambda (plist)
    (getf plist key)))

(defun process-plist-row (plist)
  (let (retval)
    (alexandria:doplist (key value plist (nreverse retval))
      (when value
        (push key retval)
        (push (case key
                ((:tstamp :crdate :datebegin :dateend :dateshow)
                 (local-time:unix-to-timestamp value))
                (:images
                 (cl-ppcre:split #\, (babel:octets-to-string value)))
                (otherwise value))
              retval)))))

(defun make-keyword (string)
  (intern (substitute #\- #\_ (string-upcase string)) :keyword))

(defun query-plist (query)
  (destructuring-bind (rows column-descriptions) (first (cl-mysql:query query))
    (let ((column-names (mapcar (alexandria:compose #'make-keyword #'first)
                                column-descriptions)))
      (mapcar (lambda (row)
                (process-plist-row (reduce #'append (mapcar #'list column-names row))))
              rows))))

(defmacro regex-replace-allf (regex place replacement)
  `(setf ,place (cl-ppcre:regex-replace-all ,regex ,place ,replacement)))

(defun canonicalize-string (string)
  (regex-replace-allf "\\s*( |&nbsp;|<[^>]+>)\\s*" string " ")
  (regex-replace-allf "\\s+" string " ")
  (regex-replace-allf "^\\s*(.*?)[,\\s]*$" string "\\1")
  string)

(defun break-lines (string)
  (cl-ppcre:split "(<br\\s*/?\\s*>|\\r?\\n|\\s*:\\s*)+" string))

(defun parse-staff (staff-string)
  (remove "" (mapcar #'canonicalize-string (break-lines staff-string)) :test #'equal))

(defun get-names (string)
  (when (cl-ppcre:scan "(?x)
^(?:
  (?: \\p{UppercaseLetter} (?: \\S* | \\. )
  \\s*){2,}
 | \\s* (?: und | , ) \\s*
 )+$"
                       string)
    (cl-ppcre:split "(?x) \\s* (?: und | , ) \\s*" string)))

(defun get-roles (string)
  (regex-replace-allf "^(.*)- und (.*)(design|assistenz)$" string "\\1\\3 und \\2\\3")
  (let (roles)
    (dolist (role-string (cl-ppcre:split "\\s*(und|,|/)\\s*" string)
                         roles)
      (when (cl-ppcre:scan "^Kurat(iert|or)$" role-string)
        (push :kurator roles))
      (when (cl-ppcre:scan "^Regi(e|sseur)$" role-string)
        (push :regie roles))
      (when (cl-ppcre:scan "^Regieassisten(z|t|tin)$" role-string)
        (push :regieassistenz roles))
      (when (cl-ppcre:scan "^Co-Regie$" role-string)
        (push :co-regie roles))
      (when (cl-ppcre:scan "^Assisten(z|t|tin)$" role-string)
        (push :assistenz roles))
      (when (cl-ppcre:scan "^Bühne(|nbild)$" role-string)
        (push :bühne roles))
      (when (cl-ppcre:scan "^Bühnenbildassisten(z|t|tin)$" role-string)
        (push :bühnenbildassistenz roles))
      (when (cl-ppcre:scan "^Kostüm(|e|bild)$" role-string)
        (push :kostüme roles))
      (when (cl-ppcre:scan "^Gesang$" role-string)
        (push :gesang roles))
      (when (cl-ppcre:scan "^Musik(|alische (Begl|L)eitung|design)$" role-string)
        (push :musik roles))
      (when (cl-ppcre:scan "^Sound(|design)$" role-string)
        (push :sound roles))
      (when (cl-ppcre:scan "^Licht(|design|installation)$" role-string)
        (push :licht roles))
      (when (cl-ppcre:scan "^Visual Design$" role-string)
        (push :visuals roles))
      (when (cl-ppcre:scan "^Englische Übertitel$" role-string)
        (push :englische-übertitel roles))
      (when (cl-ppcre:scan "^Technische Leitung$" role-string)
        (push :technische-leitung roles))
      (when (cl-ppcre:scan "^Technik$" role-string)
        (push :technik roles))
      (when (cl-ppcre:scan "^Dramaturgie$" role-string)
        (push :dramaturgie roles))
      (when (cl-ppcre:scan "^Dramaturgische Beratung$" role-string)
        (push :dramaturgische-beratung roles))
      (when (cl-ppcre:scan "^Dramaturgische Mitarbeit$" role-string)
        (push :dramaturgische-mitarbeit roles))
      (when (cl-ppcre:scan "^Präsent(ation|iert)$" role-string)
        (push :präsentation roles))
      (when (cl-ppcre:scan "^Produktion(|sleitung)$" role-string)
        (push :produktionsleitung roles))
      (when (cl-ppcre:scan "^Pr?oduktionsassisten(z|t|tin)$" role-string)
        (push :produktionsassistenz roles))
      (when (cl-ppcre:scan "^Ausstattung$" role-string)
        (push :ausstattung roles))
      (when (cl-ppcre:scan "^Projektkoordination$" role-string)
        (push :projektkoordination roles))
      (when (cl-ppcre:scan "^Ausstattungsassisten(z|t|tin)$" role-string)
        (push :ausstattungsassistenz roles))
      (when (cl-ppcre:scan "^Dramaturgieassisten(z|t|tin)$" role-string)
        (push :dramaturgieassistenz roles))
      (when (cl-ppcre:scan "^Mitarbeit Dramaturgie$" role-string)
        (push :dramaturgieassistenz roles))
      (when (cl-ppcre:scan "^Choreogra(ph|f)ie$" role-string)
        (push :choreographie roles))
      (when (cl-ppcre:scan "^Chr?oreographische Beratung$" role-string)
        (push :choreographische-beratung roles))
      (when (cl-ppcre:scan "^Projektleitung$" role-string)
        (push :projektleitung roles))
      (when (cl-ppcre:scan "^Übersetzung$" role-string)
        (push :übersetzung roles))
      (when (cl-ppcre:scan "^Paten?$" role-string)
        (push :pate roles))
      (when (cl-ppcre:scan "^Konzept$" role-string)
        (push :konzept roles))
      (when (cl-ppcre:scan "^Maske$" role-string)
        (push :maske roles))
      (when (cl-ppcre:scan "^(Mit|Darsteller(|[Ii]n(|nen)))$" role-string)
        (push :darsteller roles))
      (when (cl-ppcre:scan "^Video(|installation)$" role-string)
        (push :video roles))
      (when (cl-ppcre:scan "^Theaterpädagog(ik|in|e)$" role-string)
        (push :theaterpädagogik roles))
      (when (cl-ppcre:scan "^Körpertraining$" role-string)
        (push :körpertraining roles))
      (when (cl-ppcre:scan "^Schauspieltraining$" role-string)
        (push :schauspieltraining roles))
      (when (cl-ppcre:scan "^Foto$" role-string)
        (push :foto roles)))))

(defun ensure-person (name &rest attrs)
  (getf (or (gethash name *people*)
            (setf (gethash name *people*) (apply #'make-object "person" :name name attrs)))
        :id))

(defun revert-plist (plist)
  (reverse (loop for (key value) on plist by #'cddr
                 collect value
                 collect key)))

(defun get-people (staff-string)
  (let (people
        roles)
    (dolist (chunk (parse-staff staff-string)
                   (revert-plist people))
      (if roles
          (alexandria:if-let (new-roles (get-roles chunk))
            (setf roles new-roles)
            (alexandria:if-let (names (get-names chunk))
              (dolist (name names)
                (dolist (role roles)
                  (push (ensure-person name) (getf people role))))
              (setf roles nil)))
          (setf roles (get-roles chunk))))))

(defun events-archive ()
  (query-plist "select tke.*, sr.ref_string from tx_kbeventboard_events as tke
inner join sys_refindex as sr on sr.recuid = tke.uid and sr.sorting = 1 and sr.field = 'images'
where tke.deleted = 0 and tke.pid = 20 and tke.indexit = 0 order by tke.eventname"))

(defun import-event (event-plist)
  (flet ((attr (key)
           (getf event-plist key)))
    (make-object "event"
                 :originalUid (attr :uid)
                 :type "event"
                 :name (attr :eventname)
                 :facts (attr :facts)
                 :teaserdescription (attr :teaserdescription)
                 :eventdescription (attr :eventdescription)
                 :staff (attr :staff)
                 :date (local-time:timestamp+ (attr :dateshow) (or (parse-integer (attr :startingtime) :junk-allowed t) 0) :sec)
                 :image (second (attr :images))
                 :people (get-people (getf event-plist :staff)))))

(defun import-piece (event-plist)
  (flet ((attr (key)
           (getf event-plist key)))
    (let ((piece (make-object "piece"
                              :name (attr :eventname)
                              :facts (attr :facts)
                              :teaserdescription (attr :teaserdescription)
                              :eventdescription (attr :eventdescription)
                              :staff (attr :staff)
                              :image (second (attr :images))
                              :people (get-people (getf event-plist :staff)))))
      (make-object "event"
                   :originalUid (attr :uid)
                   :type "enactment"
                   :pieceId (getf piece :id)
                   :date (local-time:timestamp+ (attr :dateshow) (or (parse-integer (attr :startingtime) :junk-allowed t) 0) :sec)))))

(defun import-all-events ()
  (dolist (event (events-archive))
    (funcall (if (member (getf event :eventname)
                         '("SCHEPPERNDE ANTWORTEN AUF DRÖHNENDE FRAGEN"
                           "ELSEWHERE LAND "
                           "FAHRRÄDER KÖNNTEN EINE ROLLE SPIELEN"
                           "SIGHT"
                           "TELEMACHOS – SHOULD I STAY OR SHOULD I GO?")
                         :test #'equal)
                 #'import-piece
                 #'import-event)
             event)))

(defun persons-archive ()
  (query-plist "select ta.* from tt_address as ta where ta.deleted = 0 and ta.addressgroup = 1"))

(defun import-person (person-plist)
  (flet ((attr (key)
           (getf person-plist key)))
    (ensure-person (attr :name)
                   :bio (attr :description)
                   :image-credits (attr :building)
                   :image (cl-ppcre:regex-replace ".*," (babel:octets-to-string (attr :image)) ""))))

(defun import-all-persons ()
  (mapcar #'import-person (persons-archive)))

(defmacro with-object-to-json-file ((stream directory object) &body body)
  `(with-open-file (,stream (ensure-directories-exist (make-pathname :name (princ-to-string (getf ,object :id))
                                                                     :type "json"
                                                                     :defaults ,directory))
                            :direction :output :if-exists :supersede)
     (yason:with-output (,stream :indent t)
       (yason:with-object ()
         ,@body))))

(defun make-image-json (name &key (base-url "http://ballhausnaunynstrasse.de/") credits)
  "Returns the ID of the created image"
  (let* ((image-plist (make-object "image"
                                   :name (file-namestring name)))
         (id (getf image-plist :id))
         (url (puri:merge-uris name base-url))
         (blob-pathname (format nil "~~/ballhaus/data/blob/~A" id))
         (image-json-pathname (format nil "image/~D.json" id)))
    (unless (and (probe-file blob-pathname)
                 (probe-file image-json-pathname))
      (multiple-value-bind (image-data status-code headers)
          (drakma:http-request url)
        (declare (ignore status-code))
        (let ((content-type (cdr (assoc :content-type headers))))
          (unless (string-equal content-type "image/" :end1 6)
            (error "unexpected content type ~S in response to ~S" content-type url))
          (with-open-file (f (ensure-directories-exist blob-pathname)
                             :element-type '(unsigned-byte 8) :direction :output :if-exists :supersede)
            (write-sequence image-data f))
          (with-object-to-json-file (f "image/" image-plist)
            (yason:encode-object-elements "id" id
                                          "filename" name
                                          "contentType" content-type)
            (when credits
              (yason:encode-object-element "credits" credits))))))
    id))

(defun serialize-people-json (plist)
  (when plist
    (yason:with-array ()
      (alexandria:doplist (role ids plist)
        (yason:with-array ()
          (yason:encode-array-element (princ-to-string (string-downcase role)))
          (dolist (id ids)
            (yason:encode-array-element id)))))))

(defun render-bio (string)
  (cl-ppcre:regex-replace-all "(?ms)<\\?xml version=\"1\\.0\" encoding=\"UTF-8\"\\?>\\n<bio>[\\n \\t]*(<p class=\"bodytext\">|)(.*?)(</p>|)[\\n \\t]*</bio>$"
                              string
                              "\\2"))

(defun serialize-show (event-plist directory)
  (with-object-to-json-file (f directory event-plist)
    (alexandria:doplist (key value event-plist)
      (case key
        (:people
         (yason:with-object-element ("people")
           (serialize-people-json value)))
        ((:eventdescription :teaserdescription)
         (yason:with-object-element ((string-downcase key))
           (yason:with-object ()
             (yason:encode-object-element "de" value))))
        (otherwise
         (yason:encode-object-element (string-downcase key)
                                      (etypecase value
                                        (string value)
                                        (integer value)
                                        (local-time:timestamp (princ-to-string value)))))))
    (alexandria:when-let (image-name (getf event-plist :image))
      (let ((image-id (make-image-json image-name :base-url "http://ballhausnaunynstrasse.de/uploads/tx_kbeventboard/")))
        (yason:with-object-element ("images")
          (yason:with-array ()
            (yason:encode-array-element image-id)))))))

(defun import-event-json (&optional (*default-pathname-defaults* #p"~/ballhaus/data/"))
  (initialize-memory)
  (import-all-persons)
  (import-all-events)
  (dolist (person-plist (alexandria:hash-table-values (gethash "person" *objects*)))
    (with-object-to-json-file (f "person/" person-plist)
      (destructuring-bind (&key id name bio image image-credits &allow-other-keys) person-plist
        (yason:encode-object-elements "id" id
                                      "name" name)
        (when bio
          (yason:with-object-element ("bio")
            (yason:with-object ()
              (yason:encode-object-element "de" bio))))
        (when image
          (yason:encode-object-element "pictureId"
                                       (make-image-json image
                                                        :credits image-credits
                                                        :base-url "http://ballhausnaunynstrasse.de/uploads/pics/"))))))
  (dolist (event-plist (alexandria:hash-table-values (gethash "event" *objects*)))
    (serialize-show event-plist "event/"))
  (dolist (event-plist (alexandria:hash-table-values (gethash "piece" *objects*)))
    (serialize-show event-plist "piece/")))


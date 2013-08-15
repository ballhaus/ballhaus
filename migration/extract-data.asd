(defsystem :extract-data
  :serial t
  :depends-on (:alexandria
               :cl-ppcre-unicode
               :cl-mysql
               :drakma
               :local-time
               :uuid
               :cxml
               :yason
               :cxml-stp
               :xpath)
  :components ((:file "extract-data")))

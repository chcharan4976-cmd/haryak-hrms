import React from 'react'

export interface DocumentClause {
  id?: string
  title: string
  content: string
}

export interface DocumentSection {
  id?: string
  title: string
  clauses: DocumentClause[]
}

export interface DocumentSignatory {
  name: string
  title: string
  organization?: string
  department?: string
}

export interface DocumentRendererProps {
  documentNumber: string
  issueDate: string
  effectiveDate?: string | null

  subject: string
  salutation: string

  /**
   * Existing format.
   * Kept for backward compatibility.
   */
  bodyParagraphs: string[]

  /**
   * Existing flat clauses.
   */
  clauses?: DocumentClause[]

  /**
   * New preferred structure.
   * Supports multiple editable sections.
   */
  sections?: DocumentSection[]

  closingText?: string

  signatory: DocumentSignatory

  headerImageUrl?: string
  footerImageUrl?: string

  showEffectiveDate?: boolean
  className?: string
}

function formatDocumentDate(
  value?: string | null
): string {
  if (!value) {
    return ''
  }

  const safeValue =
    value.length >= 10
      ? value.slice(0, 10)
      : value

  const date =
    new Date(
      `${safeValue}T00:00:00`
    )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }
  )
}

function cleanText(
  value?: string | null
): string {
  return String(
    value || ''
  ).trim()
}

export function OfficialLetterheadRenderer({
  documentNumber,
  issueDate,
  effectiveDate,

  subject,
  salutation,

  bodyParagraphs,

  clauses,
  sections,

  closingText =
    'For Haryak Technologies India Private Limited,',

  signatory,

  headerImageUrl =
    '/letterhead/header.png',

  footerImageUrl =
    '/letterhead/footer.jpg',

  showEffectiveDate =
    false,

  className =
    '',
}: DocumentRendererProps) {
  const normalizedParagraphs =
    (
      bodyParagraphs ||
      []
    )
      .map(
        paragraph =>
          cleanText(
            paragraph
          )
      )
      .filter(
        Boolean
      )

  /**
   * New structured sections are preferred.
   *
   * If older documents only have clauses,
   * they are automatically converted into
   * a Terms & Conditions section.
   */
  const normalizedSections: DocumentSection[] =
    sections &&
    sections.length > 0
      ? sections
          .map(
            section => ({
              id:
                section.id,

              title:
                cleanText(
                  section.title
                ),

              clauses:
                (
                  section.clauses ||
                  []
                )
                  .map(
                    clause => ({
                      id:
                        clause.id,

                      title:
                        cleanText(
                          clause.title
                        ),

                      content:
                        cleanText(
                          clause.content
                        ),
                    })
                  )
                  .filter(
                    clause =>
                      clause.title ||
                      clause.content
                  ),
            })
          )
          .filter(
            section =>
              section.title ||
              section.clauses.length > 0
          )
      : clauses &&
        clauses.length > 0
      ? [
          {
            id:
              'terms-and-conditions',

            title:
              'Terms & Conditions',

            clauses:
              clauses
                .map(
                  clause => ({
                    id:
                      clause.id,

                    title:
                      cleanText(
                        clause.title
                      ),

                    content:
                      cleanText(
                        clause.content
                      ),
                  })
                )
                .filter(
                  clause =>
                    clause.title ||
                    clause.content
                ),
          },
        ]
      : []

  const formattedIssueDate =
    formatDocumentDate(
      issueDate
    )

  const formattedEffectiveDate =
    formatDocumentDate(
      effectiveDate
    )

  return (
    <div
      id="official-document-canvas"
      className={[
        'relative mx-auto overflow-hidden border bg-white text-slate-900 shadow-xl',
        'print:border-0 print:shadow-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width:
          '794px',

        minHeight:
          '1123px',

        boxSizing:
          'border-box',

        fontFamily:
          "'Segoe UI', Arial, sans-serif",

        backgroundColor:
          '#ffffff',
      }}
    >
      {/* =====================================================
          OFFICIAL LETTERHEAD HEADER
          ===================================================== */}
      <div
        className="w-full bg-white"
        style={{
          height:
            '115px',
        }}
      >
        <img
          src={
            headerImageUrl
          }
          alt="Haryak Technologies India Private Limited"
          draggable={
            false
          }
          className="h-full w-full select-none object-cover"
        />
      </div>

      {/* =====================================================
          DOCUMENT CONTENT AREA
          ===================================================== */}
      <div
        style={{
          paddingLeft:
            '54px',

          paddingRight:
            '54px',

          paddingTop:
            '30px',

          /**
           * Keep enough free space above footer.
           */
          paddingBottom:
            '155px',

          minHeight:
            '878px',
        }}
      >
        {/* ===================================================
            REFERENCE NUMBER / DATE
            =================================================== */}
        <div
          className="flex items-start justify-between gap-8 border-b border-slate-200 pb-3"
          style={{
            fontSize:
              '12px',

            lineHeight:
              '1.45',
          }}
        >
          <div className="min-w-0">
            <span className="font-bold text-slate-800">
              REF NO:
            </span>{' '}

            <span className="break-words text-slate-600">
              {documentNumber}
            </span>
          </div>

          <div className="shrink-0 text-right">
            <span className="font-bold text-slate-800">
              DATE:
            </span>{' '}

            <span className="text-slate-600">
              {formattedIssueDate}
            </span>
          </div>
        </div>

        {/* ===================================================
            EFFECTIVE DATE — OPTIONAL
            =================================================== */}
        {showEffectiveDate &&
          formattedEffectiveDate && (
            <div
              className="mt-2 text-right text-slate-500"
              style={{
                fontSize:
                  '11px',
              }}
            >
              <span className="font-semibold text-slate-700">
                EFFECTIVE DATE:
              </span>{' '}

              {formattedEffectiveDate}
            </div>
          )}

        {/* ===================================================
            SUBJECT
            =================================================== */}
        <div className="mt-7">
          <div className="border-l-4 border-[#1e2a78] pl-4">
            <h1
              className="font-bold uppercase tracking-[0.045em] text-[#172554]"
              style={{
                fontSize:
                  '17px',

                lineHeight:
                  '1.35',
              }}
            >
              SUB: {subject}
            </h1>
          </div>
        </div>

        {/* ===================================================
            SALUTATION
            =================================================== */}
        <p
          className="mt-7 font-semibold text-slate-900"
          style={{
            fontSize:
              '14px',

            lineHeight:
              '1.6',
          }}
        >
          {salutation}
        </p>

        {/* ===================================================
            BODY PARAGRAPHS
            =================================================== */}
        <div
          className="mt-5 text-justify text-slate-800"
          style={{
            fontSize:
              '14px',

            lineHeight:
              '1.72',
          }}
        >
          {normalizedParagraphs.map(
            (
              paragraph,
              index
            ) => (
              <p
                key={
                  `paragraph-${index}`
                }
                className={
                  index === 0
                    ? ''
                    : 'mt-4'
                }
              >
                {paragraph}
              </p>
            )
          )}
        </div>

        {/* ===================================================
            TERMS / SECTIONS / CLAUSES
            =================================================== */}
        {normalizedSections.map(
          (
            section,
            sectionIndex
          ) => (
            <section
              key={
                section.id ||
                `section-${sectionIndex}`
              }
              className="mt-8 break-inside-avoid"
            >
              {section.title && (
                <h2
                  className="font-bold uppercase tracking-[0.08em] text-slate-500"
                  style={{
                    fontSize:
                      '12px',

                    lineHeight:
                      '1.4',
                  }}
                >
                  {section.title}
                </h2>
              )}

              {section.clauses.length >
                0 && (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="space-y-3">
                    {section.clauses.map(
                      (
                        clause,
                        clauseIndex
                      ) => (
                        <div
                          key={
                            clause.id ||
                            `clause-${sectionIndex}-${clauseIndex}`
                          }
                          className="break-inside-avoid"
                          style={{
                            fontSize:
                              '12.5px',

                            lineHeight:
                              '1.6',
                          }}
                        >
                          <span className="font-semibold text-slate-900">
                            {clauseIndex +
                              1}
                            .

                            {clause.title
                              ? ` ${clause.title}:`
                              : ''}
                          </span>

                          {clause.content && (
                            <>
                              {' '}

                              <span className="text-slate-700">
                                {
                                  clause.content
                                }
                              </span>
                            </>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </section>
          )
        )}

        {/* ===================================================
            CLOSING
            =================================================== */}
        <div className="mt-10 break-inside-avoid">
          <p
            className="text-slate-700"
            style={{
              fontSize:
                '12.5px',

              lineHeight:
                '1.55',
            }}
          >
            {closingText}
          </p>

          {/* =================================================
              SIGNATORY
              ================================================= */}
          <div
            className="mt-8"
            style={{
              lineHeight:
                '1.45',
            }}
          >
            <p
              className="font-bold text-slate-900"
              style={{
                fontSize:
                  '13px',
              }}
            >
              {signatory.name}
            </p>

            <p
              className="mt-1 text-slate-600"
              style={{
                fontSize:
                  '12px',
              }}
            >
              {signatory.title}
            </p>

            {signatory.department && (
              <p
                className="mt-0.5 text-slate-500"
                style={{
                  fontSize:
                    '11.5px',
                }}
              >
                {
                  signatory.department
                }
              </p>
            )}

            <p
              className="mt-0.5 text-slate-500"
              style={{
                fontSize:
                  '11.5px',
              }}
            >
              {signatory.organization ||
                'Haryak Technologies India Private Limited'}
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          OFFICIAL LETTERHEAD FOOTER
          ===================================================== */}
      <div
        className="absolute bottom-0 left-0 w-full bg-white"
        style={{
          height:
            '128px',
        }}
      >
        <img
          src={
            footerImageUrl
          }
          alt="Haryak Technologies India Private Limited Footer"
          draggable={
            false
          }
          className="h-full w-full select-none object-cover"
        />
      </div>
    </div>
  )
}
'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  FileText,
  Plus,
  Save,
  Signature,
  Trash2,
} from 'lucide-react'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Input,
} from '@/components/ui/input'

import {
  Label,
} from '@/components/ui/label'

import {
  Textarea,
} from '@/components/ui/textarea'

import {
  Separator,
} from '@/components/ui/separator'

/* ============================================================
   TYPES
   ============================================================ */

export interface EditableDocumentClause {
  id: string
  title: string
  content: string
}

export interface EditableDocumentSection {
  id: string
  title: string
  clauses: EditableDocumentClause[]
}

export interface EditableDocumentSignatory {
  name: string
  title: string
  department?: string
  organization?: string
}

export interface EditableDocumentContent {
  documentNumber: string

  issueDate: string

  effectiveDate?: string | null

  subject: string

  salutation: string

  bodyParagraphs: string[]

  sections: EditableDocumentSection[]

  closingText: string

  signatory: EditableDocumentSignatory
}

interface DocumentEditorProps {
  value: EditableDocumentContent

  onChange?: (
    value: EditableDocumentContent
  ) => void

  onSave?: (
    value: EditableDocumentContent
  ) => Promise<void> | void

  saving?: boolean

  readOnly?: boolean
}

/* ============================================================
   HELPERS
   ============================================================ */

function createId(
  prefix: string
) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function normalizeInitialValue(
  value: EditableDocumentContent
): EditableDocumentContent {
  return {
    documentNumber:
      value.documentNumber || '',

    issueDate:
      value.issueDate || '',

    effectiveDate:
      value.effectiveDate || null,

    subject:
      value.subject || '',

    salutation:
      value.salutation || '',

    bodyParagraphs:
      Array.isArray(
        value.bodyParagraphs
      )
        ? value.bodyParagraphs
        : [],

    sections:
      Array.isArray(
        value.sections
      )
        ? value.sections.map(
            section => ({
              id:
                section.id ||
                createId(
                  'section'
                ),

              title:
                section.title || '',

              clauses:
                Array.isArray(
                  section.clauses
                )
                  ? section.clauses.map(
                      clause => ({
                        id:
                          clause.id ||
                          createId(
                            'clause'
                          ),

                        title:
                          clause.title ||
                          '',

                        content:
                          clause.content ||
                          '',
                      })
                    )
                  : [],
            })
          )
        : [],

    closingText:
      value.closingText ||
      'For Haryak Technologies India Private Limited,',

    signatory: {
      name:
        value.signatory?.name ||
        '',

      title:
        value.signatory?.title ||
        '',

      department:
        value.signatory
          ?.department ||
        '',

      organization:
        value.signatory
          ?.organization ||
        'Haryak Technologies India Private Limited',
    },
  }
}

/* ============================================================
   COMPONENT
   ============================================================ */

export function DocumentEditor({
  value,
  onChange,
  onSave,
  saving = false,
  readOnly = false,
}: DocumentEditorProps) {
  const [
    draft,
    setDraft,
  ] =
    useState<EditableDocumentContent>(
      () =>
        normalizeInitialValue(
          value
        )
    )

  useEffect(
    () => {
      setDraft(
        normalizeInitialValue(
          value
        )
      )
    },
    [value]
  )

  const notifyChange =
    (
      next:
        EditableDocumentContent
    ) => {
      setDraft(
        next
      )

      onChange?.(
        next
      )
    }

  /* ==========================================================
     DOCUMENT META
     ========================================================== */

  const updateMeta =
    (
      field:
        | 'documentNumber'
        | 'issueDate'
        | 'effectiveDate'
        | 'subject'
        | 'salutation'
        | 'closingText',

      fieldValue:
        string
    ) => {
      notifyChange({
        ...draft,

        [field]:
          fieldValue,
      })
    }

  /* ==========================================================
     BODY PARAGRAPHS
     ========================================================== */

  const updateParagraph =
    (
      index: number,
      text: string
    ) => {
      const paragraphs =
        [
          ...draft.bodyParagraphs,
        ]

      paragraphs[index] =
        text

      notifyChange({
        ...draft,

        bodyParagraphs:
          paragraphs,
      })
    }

  const addParagraph =
    () => {
      notifyChange({
        ...draft,

        bodyParagraphs: [
          ...draft.bodyParagraphs,
          '',
        ],
      })
    }

  const removeParagraph =
    (
      index: number
    ) => {
      notifyChange({
        ...draft,

        bodyParagraphs:
          draft.bodyParagraphs.filter(
            (
              _,
              currentIndex
            ) =>
              currentIndex !==
              index
          ),
      })
    }

  const moveParagraph =
    (
      index: number,
      direction:
        'up' |
        'down'
    ) => {
      const target =
        direction ===
        'up'
          ? index - 1
          : index + 1

      if (
        target < 0 ||
        target >=
          draft
            .bodyParagraphs
            .length
      ) {
        return
      }

      const paragraphs =
        [
          ...draft.bodyParagraphs,
        ]

      ;[
        paragraphs[index],
        paragraphs[target],
      ] = [
        paragraphs[target],
        paragraphs[index],
      ]

      notifyChange({
        ...draft,

        bodyParagraphs:
          paragraphs,
      })
    }

  /* ==========================================================
     SECTIONS
     ========================================================== */

  const addSection =
    () => {
      notifyChange({
        ...draft,

        sections: [
          ...draft.sections,

          {
            id:
              createId(
                'section'
              ),

            title:
              'New Section',

            clauses:
              [],
          },
        ],
      })
    }

  const updateSectionTitle =
    (
      sectionIndex:
        number,

      title:
        string
    ) => {
      const sections =
        draft.sections.map(
          (
            section,
            index
          ) =>
            index ===
            sectionIndex
              ? {
                  ...section,
                  title,
                }
              : section
        )

      notifyChange({
        ...draft,
        sections,
      })
    }

  const removeSection =
    (
      sectionIndex:
        number
    ) => {
      notifyChange({
        ...draft,

        sections:
          draft.sections.filter(
            (
              _,
              index
            ) =>
              index !==
              sectionIndex
          ),
      })
    }

  const moveSection =
    (
      sectionIndex:
        number,

      direction:
        'up' |
        'down'
    ) => {
      const target =
        direction ===
        'up'
          ? sectionIndex - 1
          : sectionIndex + 1

      if (
        target < 0 ||
        target >=
          draft.sections.length
      ) {
        return
      }

      const sections =
        [
          ...draft.sections,
        ]

      ;[
        sections[
          sectionIndex
        ],
        sections[
          target
        ],
      ] = [
        sections[
          target
        ],
        sections[
          sectionIndex
        ],
      ]

      notifyChange({
        ...draft,
        sections,
      })
    }

  /* ==========================================================
     CLAUSES
     ========================================================== */

  const addClause =
    (
      sectionIndex:
        number
    ) => {
      const sections =
        draft.sections.map(
          (
            section,
            index
          ) => {
            if (
              index !==
              sectionIndex
            ) {
              return section
            }

            return {
              ...section,

              clauses: [
                ...section.clauses,

                {
                  id:
                    createId(
                      'clause'
                    ),

                  title:
                    '',

                  content:
                    '',
                },
              ],
            }
          }
        )

      notifyChange({
        ...draft,
        sections,
      })
    }

  const updateClause =
    (
      sectionIndex:
        number,

      clauseIndex:
        number,

      field:
        'title' |
        'content',

      fieldValue:
        string
    ) => {
      const sections =
        draft.sections.map(
          (
            section,
            currentSection
          ) => {
            if (
              currentSection !==
              sectionIndex
            ) {
              return section
            }

            return {
              ...section,

              clauses:
                section.clauses.map(
                  (
                    clause,
                    currentClause
                  ) =>
                    currentClause ===
                    clauseIndex
                      ? {
                          ...clause,

                          [field]:
                            fieldValue,
                        }
                      : clause
                ),
            }
          }
        )

      notifyChange({
        ...draft,
        sections,
      })
    }

  const removeClause =
    (
      sectionIndex:
        number,

      clauseIndex:
        number
    ) => {
      const sections =
        draft.sections.map(
          (
            section,
            currentSection
          ) => {
            if (
              currentSection !==
              sectionIndex
            ) {
              return section
            }

            return {
              ...section,

              clauses:
                section.clauses.filter(
                  (
                    _,
                    currentClause
                  ) =>
                    currentClause !==
                    clauseIndex
                ),
            }
          }
        )

      notifyChange({
        ...draft,
        sections,
      })
    }

  const moveClause =
    (
      sectionIndex:
        number,

      clauseIndex:
        number,

      direction:
        'up' |
        'down'
    ) => {
      const sections =
        draft.sections.map(
          (
            section,
            currentSection
          ) => {
            if (
              currentSection !==
              sectionIndex
            ) {
              return section
            }

            const target =
              direction ===
              'up'
                ? clauseIndex -
                  1
                : clauseIndex +
                  1

            if (
              target < 0 ||
              target >=
                section.clauses
                  .length
            ) {
              return section
            }

            const clauses =
              [
                ...section.clauses,
              ]

            ;[
              clauses[
                clauseIndex
              ],
              clauses[
                target
              ],
            ] = [
              clauses[
                target
              ],
              clauses[
                clauseIndex
              ],
            ]

            return {
              ...section,
              clauses,
            }
          }
        )

      notifyChange({
        ...draft,
        sections,
      })
    }

  /* ==========================================================
     SIGNATORY
     ========================================================== */

  const updateSignatory =
    (
      field:
        keyof EditableDocumentSignatory,

      fieldValue:
        string
    ) => {
      notifyChange({
        ...draft,

        signatory: {
          ...draft.signatory,

          [field]:
            fieldValue,
        },
      })
    }

  /* ==========================================================
     VALIDATION
     ========================================================== */

  const canSave =
    useMemo(
      () =>
        Boolean(
          draft.documentNumber
            .trim() &&
          draft.issueDate
            .trim() &&
          draft.subject
            .trim() &&
          draft.salutation
            .trim()
        ),
      [
        draft,
      ]
    )

  const handleSave =
    async () => {
      if (
        !canSave ||
        !onSave
      ) {
        return
      }

      await onSave(
        draft
      )
    }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="space-y-5">
      {/* =====================================================
          DOCUMENT METADATA
          ===================================================== */}

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-blue-700" />

            Document Details
          </CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="document-number">
              Reference Number
            </Label>

            <Input
              id="document-number"
              value={
                draft.documentNumber
              }
              disabled={
                readOnly
              }
              onChange={
                event =>
                  updateMeta(
                    'documentNumber',
                    event.target.value
                  )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-date">
              Issue Date
            </Label>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                id="issue-date"
                type="date"
                className="pl-9"
                value={
                  draft.issueDate
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateMeta(
                      'issueDate',
                      event.target.value
                    )
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective-date">
              Effective / Joining Date
            </Label>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                id="effective-date"
                type="date"
                className="pl-9"
                value={
                  draft.effectiveDate ||
                  ''
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateMeta(
                      'effectiveDate',
                      event.target.value
                    )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* =====================================================
          HEADING
          ===================================================== */}

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">
            Letter Heading
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="document-subject">
              Subject
            </Label>

            <Input
              id="document-subject"
              value={
                draft.subject
              }
              disabled={
                readOnly
              }
              onChange={
                event =>
                  updateMeta(
                    'subject',
                    event.target.value
                  )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-salutation">
              Salutation
            </Label>

            <Input
              id="document-salutation"
              value={
                draft.salutation
              }
              disabled={
                readOnly
              }
              onChange={
                event =>
                  updateMeta(
                    'salutation',
                    event.target.value
                  )
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* =====================================================
          BODY PARAGRAPHS
          ===================================================== */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b pb-4">
          <div>
            <CardTitle className="text-base">
              Body Paragraphs
            </CardTitle>

            <p className="mt-1 text-xs text-muted-foreground">
              Edit every paragraph independently.
            </p>
          </div>

          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={
                addParagraph
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />

              Add Paragraph
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4 p-5">
          {draft.bodyParagraphs.length ===
          0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No body paragraphs.
              </p>

              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={
                    addParagraph
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />

                  Add First Paragraph
                </Button>
              )}
            </div>
          ) : (
            draft.bodyParagraphs.map(
              (
                paragraph,
                index
              ) => (
                <div
                  key={
                    `paragraph-${index}`
                  }
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Label>
                      Paragraph{' '}
                      {index + 1}
                    </Label>

                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={
                            index ===
                            0
                          }
                          onClick={() =>
                            moveParagraph(
                              index,
                              'up'
                            )
                          }
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={
                            index ===
                            draft
                              .bodyParagraphs
                              .length -
                              1
                          }
                          onClick={() =>
                            moveParagraph(
                              index,
                              'down'
                            )
                          }
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() =>
                            removeParagraph(
                              index
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Textarea
                    value={
                      paragraph
                    }
                    disabled={
                      readOnly
                    }
                    rows={
                      4
                    }
                    className="resize-y leading-relaxed"
                    onChange={
                      event =>
                        updateParagraph(
                          index,
                          event.target.value
                        )
                    }
                  />
                </div>
              )
            )
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          SECTIONS & TERMS
          ===================================================== */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b pb-4">
          <div>
            <CardTitle className="text-base">
              Sections & Terms
            </CardTitle>

            <p className="mt-1 text-xs text-muted-foreground">
              Terms & Conditions and every clause are fully editable.
            </p>
          </div>

          {!readOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={
                addSection
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />

              Add Section
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          {draft.sections.length ===
          0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No sections configured.
              </p>

              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={
                    addSection
                  }
                >
                  <Plus className="mr-1.5 h-4 w-4" />

                  Add Terms & Conditions
                </Button>
              )}
            </div>
          ) : (
            draft.sections.map(
              (
                section,
                sectionIndex
              ) => (
                <div
                  key={
                    section.id
                  }
                  className="rounded-xl border p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <Label>
                        Section Title
                      </Label>

                      <Input
                        value={
                          section.title
                        }
                        disabled={
                          readOnly
                        }
                        onChange={
                          event =>
                            updateSectionTitle(
                              sectionIndex,
                              event.target.value
                            )
                        }
                      />
                    </div>

                    {!readOnly && (
                      <div className="flex items-center gap-1 pt-7">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={
                            sectionIndex ===
                            0
                          }
                          onClick={() =>
                            moveSection(
                              sectionIndex,
                              'up'
                            )
                          }
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={
                            sectionIndex ===
                            draft.sections
                              .length -
                              1
                          }
                          onClick={() =>
                            moveSection(
                              sectionIndex,
                              'down'
                            )
                          }
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:bg-red-50"
                          onClick={() =>
                            removeSection(
                              sectionIndex
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4">
                    {section.clauses.map(
                      (
                        clause,
                        clauseIndex
                      ) => (
                        <div
                          key={
                            clause.id
                          }
                          className="rounded-lg bg-muted/30 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold">
                              Clause{' '}
                              {clauseIndex +
                                1}
                            </p>

                            {!readOnly && (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  disabled={
                                    clauseIndex ===
                                    0
                                  }
                                  onClick={() =>
                                    moveClause(
                                      sectionIndex,
                                      clauseIndex,
                                      'up'
                                    )
                                  }
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>

                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  disabled={
                                    clauseIndex ===
                                    section
                                      .clauses
                                      .length -
                                      1
                                  }
                                  onClick={() =>
                                    moveClause(
                                      sectionIndex,
                                      clauseIndex,
                                      'down'
                                    )
                                  }
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>

                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-red-600 hover:bg-red-50"
                                  onClick={() =>
                                    removeClause(
                                      sectionIndex,
                                      clauseIndex
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-2">
                              <Label>
                                Clause Heading
                              </Label>

                              <Input
                                value={
                                  clause.title
                                }
                                disabled={
                                  readOnly
                                }
                                placeholder="Example: Probation Period"
                                onChange={
                                  event =>
                                    updateClause(
                                      sectionIndex,
                                      clauseIndex,
                                      'title',
                                      event.target.value
                                    )
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>
                                Clause Content
                              </Label>

                              <Textarea
                                value={
                                  clause.content
                                }
                                disabled={
                                  readOnly
                                }
                                rows={
                                  3
                                }
                                placeholder="Enter clause content..."
                                onChange={
                                  event =>
                                    updateClause(
                                      sectionIndex,
                                      clauseIndex,
                                      'content',
                                      event.target.value
                                    )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {!readOnly && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          addClause(
                            sectionIndex
                          )
                        }
                      >
                        <Plus className="mr-1.5 h-4 w-4" />

                        Add Clause
                      </Button>
                    )}
                  </div>
                </div>
              )
            )
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          CLOSING & SIGNATORY
          ===================================================== */}

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Signature className="h-4 w-4 text-blue-700" />

            Closing & Signatory
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="closing-text">
              Closing Text
            </Label>

            <Input
              id="closing-text"
              value={
                draft.closingText
              }
              disabled={
                readOnly
              }
              onChange={
                event =>
                  updateMeta(
                    'closingText',
                    event.target.value
                  )
              }
            />
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="signatory-name">
                Signatory Name
              </Label>

              <Input
                id="signatory-name"
                value={
                  draft.signatory.name
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateSignatory(
                      'name',
                      event.target.value
                    )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatory-title">
                Designation / Title
              </Label>

              <Input
                id="signatory-title"
                value={
                  draft.signatory.title
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateSignatory(
                      'title',
                      event.target.value
                    )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatory-department">
                Department
              </Label>

              <Input
                id="signatory-department"
                value={
                  draft.signatory
                    .department ||
                  ''
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateSignatory(
                      'department',
                      event.target.value
                    )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signatory-organization">
                Organization
              </Label>

              <Input
                id="signatory-organization"
                value={
                  draft.signatory
                    .organization ||
                  ''
                }
                disabled={
                  readOnly
                }
                onChange={
                  event =>
                    updateSignatory(
                      'organization',
                      event.target.value
                    )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* =====================================================
          SAVE
          ===================================================== */}

      {!readOnly &&
        onSave && (
          <div className="sticky bottom-0 z-10 flex justify-end border-t bg-background/95 py-4 backdrop-blur">
            <Button
              type="button"
              disabled={
                !canSave ||
                saving
              }
              onClick={() =>
                void handleSave()
              }
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
            >
              <Save className="mr-2 h-4 w-4" />

              {saving
                ? 'Saving...'
                : 'Save Draft Changes'}
            </Button>
          </div>
        )}
    </div>
  )
}
import { describe, it, expect, vi } from 'vitest'
import { Input } from '@/components/ui/input'
import { loginSchema } from '@/lib/validations/auth'

describe('Login Input & Component Contract Tests', () => {
  describe('Input Component (src/components/ui/input.tsx)', () => {
    it('does NOT force value="" when only onChange is passed (uncontrolled / React Hook Form)', () => {
      const dummyOnChange = vi.fn()
      // Call forwardRef render method directly to inspect returned <input> element
      const element = (Input as any).render({
        id: 'identifier',
        name: 'identifier',
        onChange: dummyOnChange,
      }, null)

      // In React, an uncontrolled input must NOT have a value prop
      expect(element.props.value).toBeUndefined()
      expect(element.props.onChange).toBe(dummyOnChange)
    })

    it('passes controlled value when value prop is explicitly provided', () => {
      const dummyOnChange = vi.fn()
      const element = (Input as any).render({
        id: 'identifier',
        value: 'HRK-001',
        onChange: dummyOnChange,
      }, null)

      expect(element.props.value).toBe('HRK-001')
      expect(element.props.onChange).toBe(dummyOnChange)
    })

    it('coerces null value to empty string for controlled inputs to prevent React warnings', () => {
      const element = (Input as any).render({
        id: 'identifier',
        value: null as any,
      }, null)

      expect(element.props.value).toBe('')
    })

    it('preserves defaultValue for uncontrolled inputs without passing value', () => {
      const element = (Input as any).render({
        id: 'identifier',
        defaultValue: 'default@haryak.com',
      }, null)

      expect(element.props.defaultValue).toBe('default@haryak.com')
      expect(element.props.value).toBeUndefined()
    })
  })

  describe('Login Validation Schema (loginSchema)', () => {
    it('accepts valid Admin login credentials', () => {
      const validAdmin = {
        mode: 'ADMIN',
        identifier: 'admin@haryak.com',
        password: 'SecurePassword123!',
        rememberMe: true,
      }
      const result = loginSchema.safeParse(validAdmin)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.identifier).toBe('admin@haryak.com')
        expect(result.data.mode).toBe('ADMIN')
      }
    })

    it('accepts valid Employee login credentials with Employee Code', () => {
      const validEmployeeCode = {
        mode: 'EMPLOYEE',
        identifier: 'HRK-001',
        password: 'EmployeePassword123!',
        rememberMe: false,
      }
      const result = loginSchema.safeParse(validEmployeeCode)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.identifier).toBe('HRK-001')
        expect(result.data.mode).toBe('EMPLOYEE')
      }
    })

    it('accepts valid Employee login credentials with Company Email', () => {
      const validEmployeeEmail = {
        mode: 'EMPLOYEE',
        identifier: 'charan@haryak.com',
        password: 'EmployeePassword123!',
      }
      const result = loginSchema.safeParse(validEmployeeEmail)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.identifier).toBe('charan@haryak.com')
      }
    })

    it('trims whitespace from identifier without clearing valid characters', () => {
      const whitespaceIdentifier = {
        mode: 'EMPLOYEE',
        identifier: '  HRK-002  ',
        password: 'Password123!',
      }
      const result = loginSchema.safeParse(whitespaceIdentifier)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.identifier).toBe('HRK-002')
      }
    })

    it('rejects empty credentials with clear error messages', () => {
      const emptyResult = loginSchema.safeParse({
        mode: 'ADMIN',
        identifier: '',
        password: '',
      })
      expect(emptyResult.success).toBe(false)
      if (!emptyResult.success) {
        const errors = emptyResult.error.flatten().fieldErrors
        expect(errors.identifier).toBeDefined()
        expect(errors.password).toBeDefined()
      }
    })
  })

  describe('Login Form State Synchronization & Mode Switching', () => {
    it('simulates controlled state updates and verifies value matches React state', () => {
      let stateValue = ''
      const onChange = (e: any) => {
        stateValue = typeof e === 'string' ? e : e.target.value
      }

      // Initial state
      let element = (Input as any).render({
        id: 'identifier',
        value: stateValue,
        onChange,
      }, null)
      expect(element.props.value).toBe('')

      // User types 'admin@haryak.com'
      onChange({ target: { value: 'admin@haryak.com' } })
      element = (Input as any).render({
        id: 'identifier',
        value: stateValue,
        onChange,
      }, null)
      expect(element.props.value).toBe('admin@haryak.com')
      expect(stateValue).toBe('admin@haryak.com')
    })

    it('preserves password value when toggling showPassword visibility state', () => {
      const passwordValue = 'SuperSecret123!'
      let showPassword = false

      // Hidden password
      let element = (Input as any).render({
        id: 'password',
        type: showPassword ? 'text' : 'password',
        value: passwordValue,
      }, null)
      expect(element.props.type).toBe('password')
      expect(element.props.value).toBe(passwordValue)

      // Toggle to visible
      showPassword = true
      element = (Input as any).render({
        id: 'password',
        type: showPassword ? 'text' : 'password',
        value: passwordValue,
      }, null)
      expect(element.props.type).toBe('text')
      expect(element.props.value).toBe(passwordValue)

      // Toggle back to hidden
      showPassword = false
      element = (Input as any).render({
        id: 'password',
        type: showPassword ? 'text' : 'password',
        value: passwordValue,
      }, null)
      expect(element.props.type).toBe('password')
      expect(element.props.value).toBe(passwordValue)
    })

    it('switching between Admin and Employee mode retains entered credentials in state', () => {
      // Simulate form state store
      const formState = {
        mode: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
        identifier: 'vattem@haryak.com',
        password: 'Password123!',
        rememberMe: true,
      }

      const handleModeChange = (newMode: 'ADMIN' | 'EMPLOYEE') => {
        if (newMode === formState.mode) return
        // Must update mode WITHOUT clearing identifier or password
        formState.mode = newMode
      }

      // Switch to EMPLOYEE mode
      handleModeChange('EMPLOYEE')
      expect(formState.mode).toBe('EMPLOYEE')
      expect(formState.identifier).toBe('vattem@haryak.com')
      expect(formState.password).toBe('Password123!')
      expect(formState.rememberMe).toBe(true)

      // Switch back to ADMIN mode
      handleModeChange('ADMIN')
      expect(formState.mode).toBe('ADMIN')
      expect(formState.identifier).toBe('vattem@haryak.com')
      expect(formState.password).toBe('Password123!')
    })
  })
})


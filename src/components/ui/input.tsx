import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, ...props }, ref) => {
    // Only pass controlled `value` when `value` is explicitly provided.
    // If `value` is undefined, omit it so the element remains uncontrolled
    // (supporting React Hook Form `register(...)`, standard DOM inputs, etc.).
    // If `value` is null, coerce to empty string to prevent React warnings.
    const controlledProps = value !== undefined ? { value: value ?? '' } : {}

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...controlledProps}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

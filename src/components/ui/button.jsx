// src/components/ui/button.jsx

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot'; // For custom component usage
import { cva } from 'class-variance-authority'; // For managing class variants
import { cn } from '../../lib/utils'; // Utility to combine class names

// Define button variants using class-variance-authority (CVA)
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2', // Default button size
        sm: 'h-9 rounded-md px-3', // Small button size
        lg: 'h-11 rounded-md px-8', // Large button size
        icon: 'h-10 w-10', // Icon button size
      },
    },
    defaultVariants: {
      variant: 'default', // Default button variant
      size: 'default', // Default button size
    },
  }
);

// Button component definition with `forwardRef` for proper ref forwarding
const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // If `asChild` is true, render the Slot component for custom component usage
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props} // Spread the remaining props (e.g., onClick, disabled, etc.)
      />
    );
  }
);

// Set the display name of the Button component for better debugging
Button.displayName = 'Button';

// Export the Button component and buttonVariants for use in other files
export default Button;  // Default export for easier imports

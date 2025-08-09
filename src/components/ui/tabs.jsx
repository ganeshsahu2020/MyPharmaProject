import * as React from 'react';

export function Tabs({ children, value, onValueChange }) {
  return (
    <div className="w-full" role="tablist">
      {React.Children.map(children, child =>
        React.cloneElement(child, { value, onValueChange })
      )}
    </div>
  );
}

export function TabsList({ children, value, onValueChange }) {
  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {React.Children.map(children, child =>
        React.cloneElement(child, { value, onValueChange })
      )}
    </div>
  );
}

export function TabsTrigger({ children, value, onValueChange }) {
  const isSelected = value === children;
  return (
    <button
      onClick={() => onValueChange?.(children)}
      className={`inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isSelected ? 'bg-background text-foreground shadow-sm' : ''
      }`}
      role="tab"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
    >
      {children}
    </button>
  );
}

export function TabsContent({ children, value }) {
  return value === children ? (
    <div className="mt-2" role="tabpanel">
      {children}
    </div>
  ) : null;
}
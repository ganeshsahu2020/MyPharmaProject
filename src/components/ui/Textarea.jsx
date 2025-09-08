// src/components/ui/Textarea.jsx

import React from 'react';

const Textarea = ({ value, onChange, ...props }) => (
  <textarea value={value} onChange={onChange} {...props} />
);

export default Textarea;

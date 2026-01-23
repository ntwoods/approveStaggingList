import React from "react";

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-200";

const variants: Record<string, string> = {
  primary: "bg-brand-600 text-white shadow-glow hover:bg-brand-700",
  secondary: "bg-white text-brand-700 border border-brand-200 hover:border-brand-400",
  ghost: "bg-transparent text-ink-700 hover:bg-brand-100"
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
};

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`${baseClasses} ${variants[variant]} ${className}`} {...props} />
  );
}

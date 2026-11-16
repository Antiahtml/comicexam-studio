import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  // La respuesta llega al pulsar (active), no al soltar: escala breve que vuelve con la curva de salida.
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none select-none transition-[color,background-color,border-color,box-shadow,translate,scale,opacity] duration-200 ease-out active:duration-75 motion-safe:active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/85 active:bg-primary/75",
        comic: "bg-comic text-white shadow-xs hover:bg-comic/90 active:bg-comic/85",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 active:bg-destructive/85",
        outline: "border border-border bg-card shadow-xs hover:bg-muted active:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary",
        ghost: "hover:bg-muted hover:text-foreground active:bg-secondary",
        link: "text-foreground underline underline-offset-4 hover:text-foreground/70",
        // Botón de cristal (CTA secundario): borde especular, sombra amplia y brillo que se desliza al pasar el ratón.
        glass: "glass glass-hover bg-[image:var(--glass-sheen)] bg-[length:300%_300%] bg-[position:50%_0] text-foreground duration-500 [transition-property:background-position,box-shadow,translate,scale] hover:bg-[position:50%_70%]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md gap-1.5 px-3 text-xs",
        lg: "h-12 rounded-full px-8 text-[15px]",
        icon: "size-9",
        iconSm: "size-7 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

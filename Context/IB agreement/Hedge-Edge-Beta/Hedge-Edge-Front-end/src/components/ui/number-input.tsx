import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
  id?: string;
}

export const NumberInput = React.forwardRef<HTMLDivElement, NumberInputProps>(
  ({ value, onChange, min, max, step = 1, className, id }, ref) => {
    const handleIncrement = () => {
      const newValue = value + step;
      if (max === undefined || newValue <= max) {
        onChange(Number(newValue.toFixed(10)));
      }
    };

    const handleDecrement = () => {
      const newValue = value - step;
      if (min === undefined || newValue >= min) {
        onChange(Number(newValue.toFixed(10)));
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        if ((min === undefined || newValue >= min) && (max === undefined || newValue <= max)) {
          onChange(newValue);
        }
      }
    };

    return (
      <div ref={ref} className={cn("flex items-center", className)}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-r-none border-r-0 shrink-0"
          onClick={handleDecrement}
          disabled={min !== undefined && value <= min}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleInputChange}
          className="h-10 w-full border border-input bg-background px-3 py-2 text-center text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield]"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-l-none border-l-0 shrink-0"
          onClick={handleIncrement}
          disabled={max !== undefined && value >= max}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);

NumberInput.displayName = "NumberInput";

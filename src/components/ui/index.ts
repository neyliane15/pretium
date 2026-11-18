/**
 * Design system Pretium — API pública dos componentes de UI.
 * Dono: FRONTEND-1. FRONTEND-2 consome SOMENTE por aqui: `import { Button } from '@/components/ui'`.
 * Regra: novas props são aditivas e opcionais; nunca renomear/remover props existentes.
 */
export { Badge, DemoBadge, type BadgeProps, type BadgeVariant } from './Badge';
export { Button, IconButton, buttonSizes, buttonVariants, type ButtonProps, type ButtonSize, type ButtonVariant, type IconButtonProps } from './Button';
export { Card, CardBody, CardFooter, CardHeader, type CardHeaderProps, type CardProps } from './Card';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Field, Label, type FieldProps } from './Field';
export { Input, Textarea, controlBase, controlSizes, type InputProps, type TextareaProps } from './Input';
export { ConfirmDialog, Modal, type ConfirmDialogProps, type ModalProps } from './Modal';
export { NumberInput, type NumberInputProps } from './NumberInput';
export { PageHeader, type Crumb, type PageHeaderProps } from './PageHeader';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Skeleton } from './Skeleton';
export { LoadingBlock, Spinner, type SpinnerProps } from './Spinner';
export { Stat, type StatProps } from './Stat';
export { TBody, TFoot, THead, Table, TableMessage, Td, Th, Tr, type SortDir, type TableProps, type TdProps, type ThProps, type TrProps } from './Table';
export { TabLinks, Tabs, type TabItem, type TabLinkItem, type TabsProps } from './Tabs';
export { ToastProvider, useToast, type ToastInput, type ToastTipo } from './Toast';
// — FRONTEND-1, prioridade 1 (assinaturas em docs/DIVISAO_TRABALHO.md §4) —
export { Alert, type AlertProps, type AlertVariant } from './Alert';
export { Avatar, Kbd, iniciais, type AvatarProps } from './Avatar';
export { Combobox, type ComboboxProps } from './Combobox';
export { DateInput, type DateInputProps } from './DateInput';
export { Drawer, type DrawerProps } from './Drawer';
export { DropdownMenu, type DropdownMenuEntry, type DropdownMenuItem, type DropdownMenuProps } from './DropdownMenu';
export { FileDrop, type FileDropProps } from './FileDrop';
export { Pagination, paginas, type PaginationProps } from './Pagination';
export { Progress, type ProgressProps } from './Progress';
export { Tooltip, type TooltipProps } from './Tooltip';

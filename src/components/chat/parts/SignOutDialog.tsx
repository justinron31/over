import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SignOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const SignOutDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: SignOutDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Sign Out Confirmation</DialogTitle>
          <DialogDescription>
            Are you sure you want to sign out? You will need to sign in again to
            access your account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex space-x-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Sign Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import Swal, { SweetAlertIcon } from "sweetalert2";

export type ConfirmOptions = {
  title?: string;
  text?: string;
  icon?: SweetAlertIcon;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  cancelColor?: string;
};

const swalCustom = {
  popup: "rounded-2xl shadow-2xl",
  title: "text-2xl font-bold text-slate-800",
  htmlContainer: "text-base text-slate-600",
  actions: "gap-3",
  confirmButton:
    "px-6 py-2.5 rounded-lg text-white font-semibold text-base shadow-sm",
  cancelButton:
    "px-6 py-2.5 rounded-lg text-white font-semibold text-base shadow-sm",
};

function getDialogTheme() {
  if (typeof document === "undefined" || !document.documentElement.classList.contains("theme-system-dark")) {
    return { customClass: swalCustom };
  }

  return {
    background: "#10213a",
    color: "#f1f5f9",
    customClass: {
      ...swalCustom,
      popup: "rounded-2xl shadow-2xl !bg-[#10213a] !border !border-[#284361]",
      title: "text-2xl font-bold !text-slate-100",
      htmlContainer: "text-base !text-slate-300",
    },
  };
}

export async function confirmDialog(opts: ConfirmOptions = {}): Promise<boolean> {
  const {
    title = "A jeni i sigurt?",
    text = "",
    icon = "warning",
    confirmText = "Po",
    cancelText = "Anulo",
    confirmColor = "#3b82f6",
    cancelColor = "#ef4444",
  } = opts;

  const res = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: confirmColor,
    cancelButtonColor: cancelColor,
    reverseButtons: false,
    focusCancel: false,
    buttonsStyling: true,
    ...getDialogTheme(),
  });

  return res.isConfirmed;
}

export async function confirmDangerDialog(opts: ConfirmOptions = {}): Promise<boolean> {
  return confirmDialog({
    icon: "warning",
    confirmText: "Po, fshi",
    cancelText: "Anulo",
    confirmColor: "#ef4444",
    cancelColor: "#6b7280",
    ...opts,
  });
}

export async function infoDialog(title: string, text?: string): Promise<void> {
  await Swal.fire({
    title,
    text,
    icon: "info",
    confirmButtonText: "OK",
    confirmButtonColor: "#3b82f6",
    ...getDialogTheme(),
  });
}

export async function successDialog(title: string, text?: string): Promise<void> {
  await Swal.fire({
    title,
    text,
    icon: "success",
    confirmButtonText: "OK",
    confirmButtonColor: "#10b981",
    ...getDialogTheme(),
    timer: 2000,
    timerProgressBar: true,
  });
}

export async function errorDialog(title: string, text?: string): Promise<void> {
  await Swal.fire({
    title,
    text,
    icon: "error",
    confirmButtonText: "OK",
    confirmButtonColor: "#ef4444",
    ...getDialogTheme(),
  });
}

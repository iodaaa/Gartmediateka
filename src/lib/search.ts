/** Shared Unicode comparison for filenames and folder names; reusable for future fields. */
export const searchKey = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

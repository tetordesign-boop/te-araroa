
declare module "virtual:activation" {
  /** the database script that switches on the questions, the voice notes and the notifications */
  export const FEATURES_SQL: string;
  /** the "push" server function as one file */
  export const PUSH_FUNCTION: string;
}

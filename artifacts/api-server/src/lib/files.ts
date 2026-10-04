import { randomUUID } from "node:crypto";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import { HttpError } from "./security";

export const storage = new ObjectStorageService();
function objectFile(path: string) {
  const match = path.match(/^\/objects\/([a-zA-Z0-9/_-]+)$/);
  if (!match) throw new HttpError(400, "Invalid storage path.");
  const dir = storage.getPrivateObjectDir();
  const fullPath = `${dir}/${match[1]}`.replace(/^\/+/, "");
  const slash = fullPath.indexOf("/");
  return objectStorageClient.bucket(fullPath.slice(0, slash)).file(fullPath.slice(slash + 1));
}
export async function saveFile(bytes: Buffer, contentType: string, folder: string) {
  const path = `/objects/${folder}/${randomUUID()}`;
  await objectFile(path).save(bytes, { resumable: false, metadata: { contentType, cacheControl: "private, no-store" } });
  return path;
}
export async function readFileBytes(path: string) {
  const [bytes] = await objectFile(path).download();
  return bytes;
}
export async function removeFile(path: string) {
  await objectFile(path).delete({ ignoreNotFound: true });
}
export async function logoUpload(platform_id: number, contentType: string) {
  const path = `/objects/logos/${platform_id}/${randomUUID()}`;
  const [uploadURL] = await objectFile(path).getSignedUrl({ action: "write", expires: Date.now() + 10 * 60 * 1000, version: "v4", contentType });
  return { uploadURL, objectPath: path };
}
import { supabase } from "./supabase";

export type FriendStatus = "pending" | "accepted" | "declined";

export interface FriendRequest {
  id: string;
  from_user: string;
  to_user: string;
  status: FriendStatus;
  created_at: string;
}

/** All requests involving me (sent or received), any status. */
export async function getFriendRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, from_user, to_user, status, created_at")
    .or(`from_user.eq.${userId},to_user.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("get friend_requests failed", error);
    return [];
  }
  return (data as FriendRequest[]) ?? [];
}

export async function sendFriendRequest(
  fromUser: string,
  toUser: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("friend_requests")
    .insert({ from_user: fromUser, to_user: toUser, status: "pending" });
  if (error) {
    // 23505 = unique violation → a request between these two already exists.
    if (error.code === "23505") return { ok: false, error: "Заявка уже существует" };
    console.warn("send friend_request failed", error);
    return { ok: false, error: "Не удалось отправить заявку" };
  }
  return { ok: true };
}

export async function respondToRequest(id: string, accept: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", id);
  if (error) {
    console.warn("respond friend_request failed", error);
    return false;
  }
  return true;
}

export async function removeRequest(id: string): Promise<boolean> {
  const { error } = await supabase.from("friend_requests").delete().eq("id", id);
  if (error) {
    console.warn("delete friend_request failed", error);
    return false;
  }
  return true;
}

/** The other user's id for each accepted request involving me. */
export function acceptedFriendIds(requests: FriendRequest[], userId: string): string[] {
  return requests
    .filter((r) => r.status === "accepted")
    .map((r) => (r.from_user === userId ? r.to_user : r.from_user));
}

import { describe, expect, it } from "vitest";
import { parseCostumeText, readClassMeta } from "../classMeta";

describe("parseCostumeText", () => {
  it("reads a main costume with a boys' alternate", () => {
    expect(parseCostumeText("A Wish 10096Y  //  16179G (boy)")).toEqual({
      status: "selected",
      companySlug: "awishcometrue",
      primary: "10096Y",
      alternate: { style: "16179G", label: "boy" },
      raw: "A Wish 10096Y // 16179G (boy)",
    });
  });

  it("puts the boys' style second even when it is written first", () => {
    const parsed = parseCostumeText("A Wish 24183 (boy) // 24182");
    expect(parsed).toMatchObject({ primary: "24182", alternate: { style: "24183", label: "boy" } });
  });

  it.each([
    ["Weissman 19544", "weissman", "19544"],
    ["Layla's L3030", "laylas", "L3030"],
    ["A Wish H745", "awishcometrue", "H745"],
    ["A Wish Come True 27083y", "awishcometrue", "27083Y"],
    ["Revolution 27776", "revolution", "27776"],
  ])("reads %s", (raw, companySlug, primary) => {
    expect(parseCostumeText(raw)).toMatchObject({ status: "selected", companySlug, primary });
  });

  it.each(["NOT SELECTED YET", "not selected", "TBD", "", "—", undefined])(
    "treats %j as not chosen yet",
    (raw) => {
      expect(parseCostumeText(raw).status).toBe("not-selected");
    },
  );

  it("refuses to guess a company it does not recognise", () => {
    expect(parseCostumeText("Costume Gallery 12345")).toMatchObject({ status: "unreadable" });
  });

  it("needs a style number, not just a company", () => {
    expect(parseCostumeText("Weissman, something sparkly")).toMatchObject({
      status: "unreadable",
    });
  });
});

describe("readClassMeta", () => {
  const rows: unknown[][] = [
    ["Santa Train (Patty Loveless) — Ballet"],
    ["Teacher", "Julie"],
    ["Class", "3/4 year olds"],
    ["COSTUME", "A Wish 10096Y // 16179G (boy)"],
    ["Costume notes", "—"],
    [],
    ["#", "First Name", "Girth"],
  ];

  it("reads the labelled lines above the table", () => {
    expect(readClassMeta(rows, 6)).toEqual({
      title: "Santa Train (Patty Loveless) — Ballet",
      teacher: "Julie",
      classLabel: "3/4 year olds",
      costumeText: "A Wish 10096Y // 16179G (boy)",
    });
  });

  it("accepts 'Label: value' written in one cell", () => {
    expect(readClassMeta([["Costume: Weissman 19544"], ["Name", "Girth"]], 1)).toEqual({
      costumeText: "Weissman 19544",
    });
  });
});

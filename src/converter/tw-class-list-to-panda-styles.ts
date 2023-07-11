import { kebabToCamel } from "pastable";
import { PandaContext } from "./panda-context";
import { resolveMatches } from "./tw-context";
import { parseClassName } from "./tw-parser";
import { TailwindContext } from "./tw-types";
import { MatchingToken, StyleObject } from "./types";
import { findRuleProps } from "./postcss-find-rule-props";

export const twClassListToPandaStyles = (
  classList: Set<string>,
  tailwind: TailwindContext,
  panda: PandaContext
) => {
  const styles = [] as StyleObject[];
  const matchingTokens = [] as MatchingToken[];

  classList.forEach((className) => {
    const tokens = getMatchingTwCandidates(className, tailwind, panda);

    tokens.forEach((match) => {
      matchingTokens.push(match);

      const { propName, tokenName, classInfo } = match;
      // dark:text-sky-400=-> { dark: { color: "sky.400" } }
      const nested = classInfo.modifiers?.reduce(
        (acc, modifier) => {
          const prefixed = "_" + modifier;
          const condition = panda.conditions.values[prefixed];

          const conditionValue = condition ? prefixed : modifier;

          return { [conditionValue]: acc } as any;
        },
        { [propName]: tokenName }
      );
      styles.push(nested);
    });
  });

  return { styles, matchingTokens };
};

function getMatchingTwCandidates(
  className: string,
  tailwind: TailwindContext,
  panda: PandaContext
) {
  const tokens = [] as MatchingToken[];
  const classInfo = parseClassName(className);
  if (!classInfo) return tokens;

  if (!classInfo.value && !classInfo.permutations) return tokens;

  const matches = Array.from(resolveMatches(className, tailwind));
  matches.forEach((match) => {
    const [_infos, rule] = match;
    const propNameList = findRuleProps(rule).map((prop) => ({
      cssPropName: prop.propName,
      propName: kebabToCamel(prop.propName),
      rawValue: prop.value,
    }));
    propNameList.forEach((ruleProp) => {
      const { propName } = ruleProp;
      const prop = panda.config.utilities?.[propName];
      const propValues = prop && panda.utility["getPropertyValues"](prop);

      let value = classInfo.value ?? "";
      if (tailwind.candidateRuleMap.get(ruleProp.rawValue) || !propValues) {
        value = ruleProp.rawValue;
      } else if (classInfo.permutations) {
        classInfo.permutations.forEach((parts) => {
          parts.forEach((part, index) => {
            if (tailwind.candidateRuleMap.get(part)) {
              value = parts[index + 1];
            }
          });
        });

        // bg-red-500 => red.500
        value = value.replace("-", ".");
      }

      if (!value) return;

      tokens.push({ propName, tokenName: value, classInfo });
    });
  });

  return tokens;
}

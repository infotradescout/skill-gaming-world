using UnrealBuildTool;
public class WildlifeReserveTarget : TargetRules
{
    public WildlifeReserveTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("WildlifeReserve");
    }
}

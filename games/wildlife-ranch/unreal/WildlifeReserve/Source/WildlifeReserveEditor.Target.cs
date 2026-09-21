using UnrealBuildTool;
public class WildlifeReserveEditorTarget : TargetRules
{
    public WildlifeReserveEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("WildlifeReserve");
    }
}

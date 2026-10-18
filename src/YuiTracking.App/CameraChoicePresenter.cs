using Microsoft.UI.Xaml.Controls;

namespace YuiTracking;

// Do not reset a ComboBox ItemsSource while its popup is being used.
internal sealed class CameraChoicePresenter
{
    private readonly ComboBox combo;
    private readonly CameraChoices choices;
    private bool pending;
    internal CameraChoicePresenter(ComboBox combo, CameraChoices choices)
    {
        this.combo = combo; this.choices = choices;
        combo.DropDownClosed += (_, _) => { if (pending) Refresh(); };
    }
    internal void Refresh()
    {
        var list = choices.Build();
        if (combo.ItemsSource is IEnumerable<CameraChoices.Item> current && current.SequenceEqual(list)) { pending = false; return; }
        if (combo.IsDropDownOpen) { pending = true; return; }
        pending = false;
        var previous = combo.SelectedItem as CameraChoices.Item;
        combo.ItemsSource = list;
        combo.SelectedItem = CameraChoices.Select(list, previous);
    }
}
